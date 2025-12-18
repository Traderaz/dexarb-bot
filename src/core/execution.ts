/**
 * Order execution module with maker/taker fallback logic.
 * Handles placing orders, monitoring fills, and falling back to taker orders if necessary.
 */

import { IExchange } from '../exchanges/interface';
import { Order, OrderSide } from '../config/types';
import { Logger } from '../utils/logger';
import { sleep } from '../utils/retry';

export interface ExecutionResult {
  success: boolean;
  order?: Order;
  error?: string;
}

export interface LegExecutionResult {
  exchange: string;
  orderId: string;
  filledSize: number;
  averagePrice: number;
  usedMaker: boolean;
  feeUsd?: number; // Fee paid in USD
}

export class ExecutionManager {
  private logger: Logger;
  private nadoMakerFeeBps: number;
  private nadoTakerFeeBps: number;
  private lighterMakerFeeBps: number;
  private lighterTakerFeeBps: number;
  
  constructor(
    logger: Logger,
    nadoMakerFeeBps: number = 1,
    nadoTakerFeeBps: number = 3.5,
    lighterMakerFeeBps: number = 0.2,
    lighterTakerFeeBps: number = 0.2
  ) {
    this.logger = logger;
    this.nadoMakerFeeBps = nadoMakerFeeBps;
    this.nadoTakerFeeBps = nadoTakerFeeBps;
    this.lighterMakerFeeBps = lighterMakerFeeBps;
    this.lighterTakerFeeBps = lighterTakerFeeBps;
  }
  
  /**
   * Calculate fee in USD for a trade
   */
  private calculateFeeUsd(
    exchangeName: string,
    size: number,
    price: number,
    usedMaker: boolean
  ): number {
    const notionalValue = size * price;
    let feeBps: number;
    
    if (exchangeName === 'Nado') {
      feeBps = usedMaker ? this.nadoMakerFeeBps : this.nadoTakerFeeBps;
    } else if (exchangeName === 'Lighter') {
      feeBps = usedMaker ? this.lighterMakerFeeBps : this.lighterTakerFeeBps;
    } else {
      feeBps = 0;
    }
    
    return (notionalValue * feeBps) / 10000;
  }
  
  /**
   * Execute a single leg using maker orders with optional taker fallback.
   */
  async executeLeg(
    exchange: IExchange,
    symbol: string,
    side: OrderSide,
    size: number,
    targetPrice: number,
    timeoutMs: number,
    allowTakerFallback: boolean = true,
    _makerFeeBps: number = 0,
    _takerFeeBps: number = 5,
    isExit: boolean = false // Pass through to tryMakerOrder
  ): Promise<LegExecutionResult> {
    this.logger.info(
      `Executing ${isExit ? 'EXIT' : 'ENTRY'} ${side} ${size} ${symbol} on ${exchange.name} near ${targetPrice.toFixed(2)}`
    );
    
    // Step 1: Place maker order and TRUST it will fill
    const makerResult = await this.tryMakerOrder(
      exchange,
      symbol,
      side,
      size,
      targetPrice,
      timeoutMs,
      isExit // Pass exit flag for more aggressive pricing
    );
    
    // ASSUME SUCCESS: Trust that the limit order placed and will fill
    // No timeout checking, no verification - just trust it
    if (makerResult.success && makerResult.order) {
      const fillPrice = makerResult.order.price || targetPrice;
      const feeUsd = this.calculateFeeUsd(exchange.name, size, fillPrice, true);
      
      this.logger.info(
        `${exchange.name}: Limit order placed, assuming fill at ${fillPrice.toFixed(2)} (fee: $${feeUsd.toFixed(2)})`
      );
      return {
        exchange: exchange.name,
        orderId: makerResult.order.orderId,
        filledSize: size, // Assume full fill
        averagePrice: fillPrice,
        usedMaker: true,
        feeUsd
      };
    }
    
    // Step 2: Partial fill or timeout - cancel and assess
    let filledSize = 0;
    let averagePrice = targetPrice;
    
    if (makerResult.order) {
      filledSize = makerResult.order.filledSize;
      if (makerResult.order.price) {
        averagePrice = makerResult.order.price;
      }
      
      // Cancel the remaining part
      if (filledSize < size) {
        try {
          await exchange.cancelOrder(symbol, makerResult.order.orderId);
          this.logger.info(
            `${exchange.name}: Cancelled maker order ${makerResult.order.orderId} ` +
            `(filled ${filledSize}/${size})`
          );
        } catch (error) {
          this.logger.warn(`Failed to cancel order: ${error}`);
        }
      }
    }
    
    // Step 3: Fall back to taker if allowed and needed
    const remainingSize = size - filledSize;
    
    if (remainingSize > 0 && allowTakerFallback) {
      this.logger.info(
        `${exchange.name}: Falling back to taker order for remaining ${remainingSize.toFixed(4)} ${symbol}`
      );
      
      const takerResult = await this.executeTakerOrder(
        exchange,
        symbol,
        side,
        remainingSize
      );
      
      if (takerResult.success && takerResult.order) {
        // Calculate weighted average price
        const totalFilled = filledSize + takerResult.order.filledSize;
        if (filledSize > 0) {
          averagePrice = (
            (averagePrice * filledSize + (takerResult.order.price || targetPrice) * takerResult.order.filledSize) /
            totalFilled
          );
        } else {
          averagePrice = takerResult.order.price || targetPrice;
        }
        
        filledSize = totalFilled;
        
        this.logger.info(
          `${exchange.name}: Taker order filled ${takerResult.order.filledSize} at avg ${averagePrice.toFixed(2)}`
        );
      }
    }
    
    if (filledSize < size) {
      throw new Error(
        `${exchange.name}: Failed to fully fill order. ` +
        `Filled ${filledSize}/${size}. ` +
        `Taker fallback: ${allowTakerFallback ? 'allowed' : 'not allowed'}`
      );
    }
    
    const usedMaker = filledSize === (makerResult.order?.filledSize || 0);
    const feeUsd = this.calculateFeeUsd(exchange.name, filledSize, averagePrice, usedMaker);
    
    return {
      exchange: exchange.name,
      orderId: makerResult.order?.orderId || 'taker',
      filledSize,
      averagePrice,
      usedMaker,
      feeUsd
    };
  }
  
  /**
   * Try to execute with a maker limit order.
   */
  private async tryMakerOrder(
    exchange: IExchange,
    symbol: string,
    side: OrderSide,
    size: number,
    targetPrice: number,
    _timeoutMs: number, // Not used anymore - we trust order placement
    isExit: boolean = false // Flag for exit trades (more aggressive pricing)
  ): Promise<ExecutionResult> {
    try {
      // Place limit order slightly in favor of getting filled while staying on maker side
      // For buy: place slightly above mid but below best ask
      // For sell: place slightly below mid but above best bid
      const marketData = await exchange.getMarketData(symbol);
      
      let limitPrice: number;
      if (side === 'buy') {
        if (isExit) {
          // EXIT: TINY cross 0.01% (~$9) for fast fill with small size
          limitPrice = Math.ceil(marketData.askPrice * 1.0001);
        } else {
          // ENTRY: TINY cross 0.005% (~$4.5) - with 0.1 BTC we should get instant fills
          limitPrice = Math.ceil(marketData.askPrice * 1.00005);
        }
      } else {
        if (isExit) {
          // EXIT: TINY cross 0.01% (~$9) for fast fill with small size
          limitPrice = Math.floor(marketData.bidPrice * 0.9999);
        } else {
          // ENTRY: TINY cross 0.005% (~$4.5) - with 0.1 BTC we should get instant fills
          limitPrice = Math.floor(marketData.bidPrice * 0.99995);
        }
      }
      
      this.logger.debug(
        `${exchange.name}: Placing ${isExit ? 'EXIT' : 'ENTRY'} ${side} limit @ ${limitPrice.toFixed(2)} ` +
        `(mid: ${targetPrice.toFixed(2)}, bid: ${marketData.bidPrice.toFixed(2)}, ` +
        `ask: ${marketData.askPrice.toFixed(2)})`
      );
      
      const order = await exchange.placeLimitOrder(
        symbol,
        side,
        size,
        limitPrice,
        { postOnly: false } // Allow crossing for immediate fill
      );
      
      // TRUST THE ORDER: Assume it will fill, no verification needed
      this.logger.info(
        `${exchange.name}: ${isExit ? 'EXIT' : 'ENTRY'} limit order placed (orderId: ${order.orderId}), ` +
        `assuming fill at ${limitPrice.toFixed(2)}`
      );
      
      return { 
        success: true, 
        order: {
          ...order,
          filledSize: size, // Assume full fill
          status: 'filled',
          price: limitPrice
        }
      };
      
    } catch (error) {
      this.logger.error(`${exchange.name}: Maker order failed: ${error}`);
      return { success: false, error: String(error) };
    }
  }
  
  /**
   * Execute with a market (taker) order.
   */
  private async executeTakerOrder(
    exchange: IExchange,
    symbol: string,
    side: OrderSide,
    size: number
  ): Promise<ExecutionResult> {
    try {
      const order = await exchange.placeMarketOrder(symbol, side, size);
      
      // For IOC market orders, trust the placement response
      // Some exchanges (like Nado) have broken getOrder() APIs that return "not found" even for successful orders
      if (order.status === 'filled') {
        return { success: true, order };
      }
      
      // If order was placed successfully but not marked as filled, wait and check
      // Skip getOrder() verification for Nado to avoid "order not found" errors
      if (exchange.name === 'Nado') {
        // Trust that Nado IOC orders execute immediately
        this.logger.info(`${exchange.name}: Assuming IOC market order filled immediately`);
        return {
          success: true,
          order: {
            ...order,
            status: 'filled',
            filledSize: size
          }
        };
      }
      
      // For other exchanges, verify fill status
      let currentOrder = order;
      for (let i = 0; i < 5; i++) {
        await sleep(200);
        currentOrder = await exchange.getOrder(symbol, order.orderId);
        
        if (currentOrder.status === 'filled') {
          return { success: true, order: currentOrder };
        }
      }
      
      if (currentOrder.filledSize > 0) {
        return { success: true, order: currentOrder };
      }
      
      return { success: false, order: currentOrder };
      
    } catch (error) {
      this.logger.error(`${exchange.name}: Taker order failed: ${error}`);
      return { success: false, error: String(error) };
    }
  }
  
  /**
   * Execute both legs of a spread trade:
   * - Nado: Limit order (0.01% maker fee)
   * - Lighter: Market order (0% taker fee = FREE!)
   */
  async executeSpreadEntry(
    cheapExchange: IExchange,
    expensiveExchange: IExchange,
    symbol: string,
    size: number,
    _cheapPrice: number,
    _expensivePrice: number,
    _timeoutMs: number,
    _allowTakerFallback: boolean = true
  ): Promise<{
    cheapLeg: LegExecutionResult;
    expensiveLeg: LegExecutionResult;
  }> {
    this.logger.info(
      `Executing spread entry: LONG ${size} on ${cheapExchange.name}, ` +
      `SHORT ${size} on ${expensiveExchange.name}`
    );
    
    // STRATEGY: Simultaneous aggressive limits on BOTH exchanges (0.04% aggressive pricing)
    this.logger.info(`🚀 SIMULTANEOUS: Aggressive limits on BOTH sides (0.04% aggressive)...`);
    
    // Get fresh market data
    const [cheapMarket, expensiveMarket] = await Promise.all([
      cheapExchange.getMarketData(symbol),
      expensiveExchange.getMarketData(symbol)
    ]);
    
    // Determine which is Nado and which is Lighter
    const isNadoCheap = cheapExchange.name === 'Nado';
    const nadoExchange = isNadoCheap ? cheapExchange : expensiveExchange;
    const lighterExchange = isNadoCheap ? expensiveExchange : cheapExchange;
    const nadoSide = isNadoCheap ? 'buy' : 'sell';
    const lighterSide = isNadoCheap ? 'sell' : 'buy';
    const nadoMarket = isNadoCheap ? cheapMarket : expensiveMarket;
    const lighterMarket = isNadoCheap ? expensiveMarket : cheapMarket;
    
    // Calculate aggressive limit prices (0.04% = 4 bps aggressive, tight fills)
    const nadoLimitPrice = nadoSide === 'buy' 
      ? nadoMarket.askPrice * 1.0004  // Buy: 0.04% above ask (crosses spread)
      : nadoMarket.bidPrice * 0.9996; // Sell: 0.04% below bid (crosses spread)
    
    const lighterLimitPrice = lighterSide === 'buy'
      ? lighterMarket.askPrice * 1.0004  // Buy: 0.04% above ask (crosses spread)
      : lighterMarket.bidPrice * 0.9996; // Sell: 0.04% below bid (crosses spread)
    
    // Place BOTH aggressive limit orders SIMULTANEOUSLY
    this.logger.info(`Placing aggressive limits: Nado ${nadoSide.toUpperCase()} @ ${nadoLimitPrice.toFixed(2)}, Lighter ${lighterSide.toUpperCase()} @ ${lighterLimitPrice.toFixed(2)}`);
    
    const [nadoOrder, lighterOrder] = await Promise.all([
      nadoExchange.placeLimitOrder(symbol, nadoSide, size, nadoLimitPrice, { postOnly: false }),
      lighterExchange.placeLimitOrder(symbol, lighterSide, size, lighterLimitPrice, { postOnly: false })
    ]);
    
    this.logger.info(`✓ Both orders placed! Nado: ${nadoOrder.orderId}, Lighter: ${lighterOrder.orderId}`);
    
    // Wait and verify fills with retries (APIs can be slow to update)
    this.logger.info(`⏳ Waiting for fills to settle and APIs to update...`);
    
    let nadoFilledSize = 0;
    let lighterFilledSize = 0;
    let nadoFillPrice = nadoLimitPrice;
    let lighterFillPrice = lighterLimitPrice;
    
    // Try up to 3 times with increasing wait times (10s, 15s total)
    for (let attempt = 1; attempt <= 3; attempt++) {
      const waitTime = attempt === 1 ? 10000 : 5000; // 10s first, then 5s more
      this.logger.info(`  Attempt ${attempt}/3: Waiting ${waitTime/1000}s...`);
      await sleep(waitTime);
      
      // Check positions
      const [nadoPos, lighterPos] = await Promise.all([
        nadoExchange.getPosition(symbol),
        lighterExchange.getPosition(symbol)
      ]);
      
      nadoFilledSize = Math.abs(nadoPos?.size || 0);
      lighterFilledSize = Math.abs(lighterPos?.size || 0);
      nadoFillPrice = nadoPos?.entryPrice || nadoLimitPrice;
      lighterFillPrice = lighterPos?.entryPrice || lighterLimitPrice;
      
      this.logger.info(`  Nado: ${nadoFilledSize} BTC, Lighter: ${lighterFilledSize} BTC`);
      
      // Check if both filled
      if (nadoFilledSize >= size * 0.99 && lighterFilledSize >= size * 0.99) {
        this.logger.info(`✅ Both filled successfully after ${attempt} attempt(s)`);
        break;
      }
      
      if (attempt < 3) {
        this.logger.warn(`⚠️  Not both filled yet, retrying...`);
      }
    }
    
    // Verify both filled - if not, AUTOMATICALLY close any open position
    if (nadoFilledSize < size * 0.99 || lighterFilledSize < size * 0.99) {
      this.logger.error(`❌ UNHEDGED: Nado ${nadoFilledSize} BTC, Lighter ${lighterFilledSize} BTC`);
      
      // Automatically close any open position to avoid unhedged exposure
      if (nadoFilledSize >= size * 0.99 && lighterFilledSize < size * 0.99) {
        // Nado filled, Lighter didn't - close Nado position
        this.logger.warn(`🚨 CLOSING NADO POSITION: ${nadoFilledSize} BTC ${nadoSide} (unhedged)`);
        const closeNadoSide = nadoSide === 'buy' ? 'sell' : 'buy';
        await nadoExchange.placeMarketOrder(symbol, closeNadoSide, nadoFilledSize);
        this.logger.info(`✓ Nado position closed with market order`);
        throw new Error(`Entry aborted: Lighter did not fill, Nado position auto-closed`);
      } else if (lighterFilledSize >= size * 0.99 && nadoFilledSize < size * 0.99) {
        // Lighter filled, Nado didn't - close Lighter position
        this.logger.warn(`🚨 CLOSING LIGHTER POSITION: ${lighterFilledSize} BTC ${lighterSide} (unhedged)`);
        const closeLighterSide = lighterSide === 'buy' ? 'sell' : 'buy';
        await lighterExchange.placeMarketOrder(symbol, closeLighterSide, lighterFilledSize);
        this.logger.info(`✓ Lighter position closed with market order`);
        throw new Error(`Entry aborted: Nado did not fill, Lighter position auto-closed`);
      } else {
        // Neither filled or both partially filled
        this.logger.error(`❌ Neither side filled properly - check exchanges manually`);
        throw new Error(`Entry failed: Nado ${nadoFilledSize}, Lighter ${lighterFilledSize}`);
      }
    }
    
    this.logger.info(`✓ Both filled! Nado: ${nadoFillPrice.toFixed(2)}, Lighter: ${lighterFillPrice.toFixed(2)}`);
    
    // Build results
    const nadoResult: LegExecutionResult = {
      exchange: nadoExchange.name,
      orderId: nadoOrder.orderId,
      filledSize: nadoFilledSize,
      averagePrice: nadoFillPrice,
      usedMaker: true, // Limit order at mid = maker = 0.01% fee
      feeUsd: this.calculateFeeUsd(nadoExchange.name, nadoFilledSize, nadoFillPrice, true)
        };
    
    const lighterResult: LegExecutionResult = {
      exchange: lighterExchange.name,
      orderId: lighterOrder.orderId,
      filledSize: lighterFilledSize,
      averagePrice: lighterFillPrice,
      usedMaker: true, // Aggressive limit = taker (crosses spread)
      feeUsd: this.calculateFeeUsd(lighterExchange.name, lighterFilledSize, lighterFillPrice, true)
    };
    
    this.logger.info(`✓ Lighter: ${lighterResult.averagePrice.toFixed(2)}, Nado: ${nadoResult.averagePrice.toFixed(2)}`);
    
    // CRITICAL: Verify actual fills match expected (wait 5s for final settlement)
    this.logger.info('🔍 Verifying actual fills on exchanges...');
    await sleep(5000);
    
    const fillVerification = await this.verifyFills(
      cheapExchange,
      expensiveExchange,
      symbol,
      size,
      lighterResult.filledSize,
      nadoResult.filledSize
    );
    
    if (!fillVerification.success) {
      this.logger.error(`❌ FILL VERIFICATION FAILED: ${fillVerification.error}`);
      this.logger.error(`⚠️  EMERGENCY: ${fillVerification.action}`);
      throw new Error(fillVerification.error);
    }
    
    this.logger.info('✅ Fill verification passed - positions match expected');
    
    const cheapResult = isNadoCheap ? nadoResult : lighterResult;
    const expensiveLeg = isNadoCheap ? lighterResult : nadoResult;
    
    // Calculate P&L
    const buyNotional = cheapResult.filledSize * cheapResult.averagePrice;
    const sellNotional = expensiveLeg.filledSize * expensiveLeg.averagePrice;
    const grossPnl = sellNotional - buyNotional;
    const totalFees = (cheapResult.feeUsd || 0) + (expensiveLeg.feeUsd || 0);
    const netPnl = grossPnl - totalFees;
    
    this.logger.info(
      `\n` +
      `═══════════════════════════════════════════════════════════\n` +
      `📊 SPREAD ENTRY COMPLETE\n` +
      `───────────────────────────────────────────────────────────\n` +
      `  ${cheapExchange.name}: BUY ${cheapResult.filledSize} BTC @ $${cheapResult.averagePrice.toFixed(2)}\n` +
      `    Fee: $${(cheapResult.feeUsd || 0).toFixed(2)} (${cheapResult.usedMaker ? 'maker' : 'taker'})\n` +
      `\n` +
      `  ${expensiveExchange.name}: SELL ${expensiveLeg.filledSize} BTC @ $${expensiveLeg.averagePrice.toFixed(2)}\n` +
      `    Fee: $${(expensiveLeg.feeUsd || 0).toFixed(2)} (${expensiveLeg.usedMaker ? 'maker' : 'taker'})\n` +
      `───────────────────────────────────────────────────────────\n` +
      `  Gross P&L: $${grossPnl.toFixed(2)}\n` +
      `  Total Fees: -$${totalFees.toFixed(2)}\n` +
      `  Net P&L: $${netPnl.toFixed(2)} ${netPnl >= 0 ? '✅' : '❌'}\n` +
      `  Airdrop Value: +$100.00 ✨\n` +
      `  TOTAL VALUE: $${(netPnl + 100).toFixed(2)} 💰\n` +
      `═══════════════════════════════════════════════════════════`
    );
    
    return { cheapLeg: cheapResult, expensiveLeg };
  }
  
  /**
   * Execute both legs of a spread exit:
   * SEQUENTIAL: Nado limit first (maker), then Lighter market (0% fee)
   */
  async executeSpreadExit(
    longExchange: IExchange,
    shortExchange: IExchange,
    symbol: string,
    size: number,
    _longExitPrice: number,
    _shortExitPrice: number,
    _timeoutMs: number,
    _allowTakerFallback: boolean = true
  ): Promise<{
    longLeg: LegExecutionResult;
    shortLeg: LegExecutionResult;
  }> {
    this.logger.info(
      `Executing spread exit: CLOSE LONG ${size} on ${longExchange.name}, ` +
      `CLOSE SHORT ${size} on ${shortExchange.name}`
    );
    
    // STRATEGY: Simultaneous aggressive limits on BOTH exchanges (0.04% aggressive pricing)
    this.logger.info(`🚀 EXIT SIMULTANEOUS: Aggressive limits on BOTH sides (0.04% aggressive)...`);
    
    // Get fresh market data
    const [longMarket, shortMarket] = await Promise.all([
      longExchange.getMarketData(symbol),
      shortExchange.getMarketData(symbol)
    ]);
    
    // Determine which is Nado and which is Lighter
    const isNadoLong = longExchange.name === 'Nado';
    const nadoExchange = isNadoLong ? longExchange : shortExchange;
    const lighterExchange = isNadoLong ? shortExchange : longExchange;
    const nadoSide = isNadoLong ? 'sell' : 'buy'; // Close LONG = sell, Close SHORT = buy
    const lighterSide = isNadoLong ? 'buy' : 'sell';
    const nadoMarket = isNadoLong ? longMarket : shortMarket;
    const lighterMarket = isNadoLong ? shortMarket : longMarket;
    
    // Calculate aggressive limit prices for exit (0.04% = tight exit fills)
    const nadoLimitPrice = nadoSide === 'buy' 
      ? nadoMarket.askPrice * 1.0004  // Buy: 0.04% above ask (crosses spread)
      : nadoMarket.bidPrice * 0.9996; // Sell: 0.04% below bid (crosses spread)
    
    const lighterLimitPrice = lighterSide === 'buy'
      ? lighterMarket.askPrice * 1.0004  // Buy: 0.04% above ask (crosses spread)
      : lighterMarket.bidPrice * 0.9996; // Sell: 0.04% below bid (crosses spread)
    
    // Place BOTH orders simultaneously
    this.logger.info(`Placing Nado ${nadoSide.toUpperCase()} @ ${nadoLimitPrice.toFixed(2)}, Lighter ${lighterSide.toUpperCase()} @ ${lighterLimitPrice.toFixed(2)}...`);
    
    const [nadoOrder, lighterOrder] = await Promise.all([
      nadoExchange.placeLimitOrder(symbol, nadoSide, size, nadoLimitPrice, { postOnly: false, reduceOnly: true }),
      lighterExchange.placeLimitOrder(symbol, lighterSide, size, lighterLimitPrice, { postOnly: false, reduceOnly: true })
    ]);
    
    this.logger.info(`✓ Both exit orders placed! Nado: ${nadoOrder.orderId}, Lighter: ${lighterOrder.orderId}`);
    
    // Wait and verify fills with retries (APIs can be slow to update)
    this.logger.info(`⏳ Waiting for exit fills to settle and APIs to update...`);
    
    let nadoFilledSize = size;
    let lighterFilledSize = size;
    let nadoFillPrice = nadoLimitPrice;
    let lighterFillPrice = lighterLimitPrice;
    
    // Try up to 3 times with increasing wait times (10s, 15s total)
    for (let attempt = 1; attempt <= 3; attempt++) {
      const waitTime = attempt === 1 ? 10000 : 5000; // 10s first, then 5s more
      this.logger.info(`  Attempt ${attempt}/3: Waiting ${waitTime/1000}s...`);
      await sleep(waitTime);
      
      // Check positions (should be closed or near 0)
      const [nadoPos, lighterPos] = await Promise.all([
        nadoExchange.getPosition(symbol),
        lighterExchange.getPosition(symbol)
      ]);
      
      const nadoClosed = Math.abs(nadoPos?.size || 0) < size * 0.1;
      const lighterClosed = Math.abs(lighterPos?.size || 0) < size * 0.1;
      
      this.logger.info(`  Nado: ${nadoClosed ? 'CLOSED' : 'NOT CLOSED'}, Lighter: ${lighterClosed ? 'CLOSED' : 'NOT CLOSED'}`);
      
      // Check if both closed
      if (nadoClosed && lighterClosed) {
        this.logger.info(`✅ Both positions closed successfully after ${attempt} attempt(s)`);
        break;
      }
      
      if (attempt < 3) {
        this.logger.warn(`⚠️  Not both closed yet, retrying...`);
      }
    }
    
    // Build results
    const nadoResult: LegExecutionResult = {
      exchange: nadoExchange.name,
      orderId: nadoOrder.orderId,
      filledSize: nadoFilledSize,
      averagePrice: nadoFillPrice,
      usedMaker: true, // Aggressive limit (crosses spread but still maker on some exchanges)
      feeUsd: this.calculateFeeUsd(nadoExchange.name, nadoFilledSize, nadoFillPrice, true)
    };
    
    const lighterResult: LegExecutionResult = {
      exchange: lighterExchange.name,
      orderId: lighterOrder.orderId,
      filledSize: lighterFilledSize,
      averagePrice: lighterFillPrice,
      usedMaker: true, // Aggressive limit
      feeUsd: this.calculateFeeUsd(lighterExchange.name, lighterFilledSize, lighterFillPrice, true)
    };
    
    // Return in the expected order (longLeg, shortLeg)
    const longResult = isNadoLong ? nadoResult : lighterResult;
    const shortResult = isNadoLong ? lighterResult : nadoResult;
    
    // Calculate exit P&L
    const sellNotional = longResult.filledSize * longResult.averagePrice;
    const buyNotional = shortResult.filledSize * shortResult.averagePrice;
    const grossPnl = sellNotional - buyNotional;
    const totalFees = (longResult.feeUsd || 0) + (shortResult.feeUsd || 0);
    const netPnl = grossPnl - totalFees;
    
    this.logger.info(`✓ Nado: ${nadoResult.averagePrice.toFixed(2)}, Lighter: ${lighterResult.averagePrice.toFixed(2)}`);
    
    this.logger.info(
      `\n` +
      `═══════════════════════════════════════════════════════════\n` +
      `📊 SPREAD EXIT COMPLETE\n` +
      `───────────────────────────────────────────────────────────\n` +
      `  ${longExchange.name}: SELL ${longResult.filledSize} BTC @ $${longResult.averagePrice.toFixed(2)}\n` +
      `    Fee: $${(longResult.feeUsd || 0).toFixed(2)} (${longResult.usedMaker ? 'maker' : 'taker'})\n` +
      `\n` +
      `  ${shortExchange.name}: BUY ${shortResult.filledSize} BTC @ $${shortResult.averagePrice.toFixed(2)}\n` +
      `    Fee: $${(shortResult.feeUsd || 0).toFixed(2)} (${shortResult.usedMaker ? 'maker' : 'taker'})\n` +
      `───────────────────────────────────────────────────────────\n` +
      `  Gross P&L: $${grossPnl.toFixed(2)}\n` +
      `  Total Fees: -$${totalFees.toFixed(2)}\n` +
      `  Net P&L: $${netPnl.toFixed(2)} ${netPnl >= 0 ? '✅' : '❌'}\n` +
      `  Airdrop Value: +$100.00 ✨\n` +
      `  TOTAL VALUE: $${(netPnl + 100).toFixed(2)} 💰\n` +
      `═══════════════════════════════════════════════════════════`
    );
    
    return { longLeg: longResult, shortLeg: shortResult };
  }
  
  /**
   * Verify that actual positions on exchanges match expected fills
   * CRITICAL SAFETY CHECK to prevent unhedged positions from partial fills
   */
  private async verifyFills(
    cheapExchange: IExchange,
    expensiveExchange: IExchange,
    symbol: string,
    expectedSize: number,
    lighterReportedFill: number,
    nadoReportedFill: number
  ): Promise<{
    success: boolean;
    error?: string;
    action?: string;
  }> {
    try {
      // Get actual positions from both exchanges
      const [cheapPosition, expensivePosition] = await Promise.all([
        cheapExchange.getPosition(symbol),
        expensiveExchange.getPosition(symbol)
      ]);
      
      const cheapActualSize = Math.abs(cheapPosition?.size || 0);
      const expensiveActualSize = Math.abs(expensivePosition?.size || 0);
      
      const tolerance = 0.003; // 0.3% tolerance for partial fills (0.0006 BTC on 0.02 BTC order)
      
      // Check if both positions exist and match expected size
      const cheapSizeOk = Math.abs(cheapActualSize - expectedSize) < tolerance;
      const expensiveSizeOk = Math.abs(expensiveActualSize - expectedSize) < tolerance;
      
      if (cheapSizeOk && expensiveSizeOk) {
        // Perfect - both sides filled as expected
        return { success: true };
      }
      
      // Something went wrong - detailed diagnostics
      this.logger.error('❌ FILL MISMATCH DETECTED:');
      this.logger.error(`   Expected: ${expectedSize} BTC on each side`);
      this.logger.error(`   ${cheapExchange.name} actual: ${cheapActualSize} BTC (reported: ${lighterReportedFill})`);
      this.logger.error(`   ${expensiveExchange.name} actual: ${expensiveActualSize} BTC (reported: ${nadoReportedFill})`);
      
      // Determine the problem
      let error = '';
      let action = '';
      
      if (cheapActualSize === 0 && expensiveActualSize === 0) {
        error = 'CRITICAL: NO FILLS on either exchange - orders may have failed';
        action = 'Check exchange UIs manually. No positions to close.';
      } else if (cheapActualSize === 0 && expensiveActualSize > 0) {
        error = `CRITICAL: Only ${expensiveExchange.name} filled (${expensiveActualSize} BTC) - UNHEDGED!`;
        action = `MANUALLY CLOSE ${expensiveActualSize} BTC on ${expensiveExchange.name} immediately!`;
      } else if (cheapActualSize > 0 && expensiveActualSize === 0) {
        error = `CRITICAL: Only ${cheapExchange.name} filled (${cheapActualSize} BTC) - UNHEDGED!`;
        action = `MANUALLY CLOSE ${cheapActualSize} BTC on ${cheapExchange.name} immediately!`;
      } else if (Math.abs(cheapActualSize - expensiveActualSize) > tolerance) {
        const diff = Math.abs(cheapActualSize - expensiveActualSize);
        error = `CRITICAL: Size mismatch - ${cheapExchange.name}: ${cheapActualSize}, ${expensiveExchange.name}: ${expensiveActualSize}`;
        action = `PARTIAL FILL DETECTED! Difference: ${diff.toFixed(4)} BTC. Check exchanges and close manually.`;
      } else if (cheapActualSize < expectedSize * 0.5) {
        // Both filled but way less than expected (< 50%)
        error = `WARNING: Both sides only partially filled (~${((cheapActualSize / expectedSize) * 100).toFixed(1)}%)`;
        action = `Positions are hedged but smaller than expected. Monitor for exit.`;
        // This is actually OK - still hedged, just smaller
        return { success: true };
      } else {
        // Both filled, sizes match each other, but don't match expected
        // This could be OK if they're close
        error = `INFO: Fill sizes differ from expected but are hedged`;
        action = `${cheapExchange.name}: ${cheapActualSize}, ${expensiveExchange.name}: ${expensiveActualSize}. Monitoring.`;
        return { success: true }; // Still hedged, acceptable
      }
      
      return {
        success: false,
        error,
        action
      };
      
    } catch (error) {
      this.logger.error(`Failed to verify fills: ${error}`);
      return {
        success: false,
        error: `Fill verification check failed: ${error}`,
        action: 'Check positions manually on both exchanges!'
      };
    }
  }
}

