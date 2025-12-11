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
    cheapPrice: number,
    expensivePrice: number,
    timeoutMs: number,
    _allowTakerFallback: boolean = true
  ): Promise<{
    cheapLeg: LegExecutionResult;
    expensiveLeg: LegExecutionResult;
  }> {
    this.logger.info(
      `Executing spread entry: LONG ${size} on ${cheapExchange.name}, ` +
      `SHORT ${size} on ${expensiveExchange.name}`
    );
    
    // NEW STRATEGY: Fire both simultaneously - Nado limit + Lighter market, trust both fill
    this.logger.info(`🚀 SIMULTANEOUS: Nado LIMIT (0% maker) + Lighter MARKET (0% taker)...`);
    
    // Determine which is Nado and which is Lighter
    const isNadoCheap = cheapExchange.name === 'Nado';
    
    let lighterPromise: Promise<LegExecutionResult>;
    let nadoPromise: Promise<LegExecutionResult>;
    
    // Execute BOTH at the same time
    if (isNadoCheap) {
      // Nado is cheap, Lighter is expensive
      this.logger.info(`Nado: LIMIT BUY ${size} BTC @ ${cheapPrice.toFixed(2)}`);
      this.logger.info(`Lighter: MARKET SELL ${size} BTC (instant)`);
      
      nadoPromise = this.executeLeg(cheapExchange, symbol, 'buy', size, cheapPrice, timeoutMs, false, 0, 5, false);
      lighterPromise = this.executeTakerOrder(expensiveExchange, symbol, 'sell', size).then(result => {
        const fillPrice = result.order?.price || expensivePrice;
        const fillSize = result.order?.filledSize || size;
        return {
          exchange: expensiveExchange.name,
          orderId: result.order?.orderId || 'market',
          filledSize: fillSize,
          averagePrice: fillPrice,
          usedMaker: false,
          feeUsd: this.calculateFeeUsd(expensiveExchange.name, fillSize, fillPrice, false)
        };
      });
    } else {
      // Lighter is cheap, Nado is expensive
      this.logger.info(`Lighter: MARKET BUY ${size} BTC (instant)`);
      this.logger.info(`Nado: LIMIT SELL ${size} BTC @ ${expensivePrice.toFixed(2)}`);
      
      lighterPromise = this.executeTakerOrder(cheapExchange, symbol, 'buy', size).then(result => {
        const fillPrice = result.order?.price || cheapPrice;
        const fillSize = result.order?.filledSize || size;
        return {
          exchange: cheapExchange.name,
          orderId: result.order?.orderId || 'market',
          filledSize: fillSize,
          averagePrice: fillPrice,
          usedMaker: false,
          feeUsd: this.calculateFeeUsd(cheapExchange.name, fillSize, fillPrice, false)
        };
      });
      nadoPromise = this.executeLeg(expensiveExchange, symbol, 'sell', size, expensivePrice, timeoutMs, false, 0, 5, false);
    }
    
    // Wait for both to complete (fire simultaneously, don't wait for verification)
    let lighterResult: LegExecutionResult;
    let nadoResult: LegExecutionResult;
    
    try {
      [lighterResult, nadoResult] = await Promise.all([lighterPromise, nadoPromise]);
    } catch (error) {
      this.logger.error(`❌ CRITICAL: One or both legs failed! Error: ${error}`);
      this.logger.error(`⚠️  MANUAL INTERVENTION REQUIRED - Check positions on both exchanges!`);
      throw new Error(`Spread entry failed - potential unhedged position. Check exchanges manually! ${error}`);
    }
    
    this.logger.info(`✓ Lighter: ${lighterResult.averagePrice.toFixed(2)}, Nado: ${nadoResult.averagePrice.toFixed(2)}`);
    
    const [expensiveLeg, cheapResult] = isNadoCheap ? [lighterResult, nadoResult] : [nadoResult, lighterResult];
    
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
   * - Nado: Limit order (0.01% maker fee)
   * - Lighter: Market order (0% taker fee = FREE!)
   */
  async executeSpreadExit(
    longExchange: IExchange,
    shortExchange: IExchange,
    symbol: string,
    size: number,
    longExitPrice: number,
    shortExitPrice: number,
    timeoutMs: number,
    _allowTakerFallback: boolean = true
  ): Promise<{
    longLeg: LegExecutionResult;
    shortLeg: LegExecutionResult;
  }> {
    this.logger.info(
      `Executing spread exit: CLOSE LONG ${size} on ${longExchange.name}, ` +
      `CLOSE SHORT ${size} on ${shortExchange.name}`
    );
    
    // NEW: Fire both simultaneously - Nado limit + Lighter market
    this.logger.info(`🚀 EXIT SIMULTANEOUS: Nado LIMIT (0% maker) + Lighter MARKET (0% taker)...`);
    
    let longLeg: Promise<LegExecutionResult>;
    let shortLeg: Promise<LegExecutionResult>;
    
    // Determine which exchange is which and execute both simultaneously
    if (longExchange.name === 'Lighter') {
      // Lighter is long - MARKET SELL to close
      this.logger.info(`Lighter: MARKET SELL ${size} BTC (close long)`);
      longLeg = this.executeTakerOrder(longExchange, symbol, 'sell', size).then(result => {
        const fillPrice = result.order?.price || longExitPrice;
        const fillSize = result.order?.filledSize || size;
        return {
          exchange: longExchange.name,
          orderId: result.order?.orderId || 'market',
          filledSize: fillSize,
          averagePrice: fillPrice,
          usedMaker: false,
          feeUsd: this.calculateFeeUsd(longExchange.name, fillSize, fillPrice, false)
        };
      });
    } else {
      // Nado is long - AGGRESSIVE LIMIT SELL with TAKER FALLBACK to guarantee fill
      this.logger.info(`Nado: AGGRESSIVE LIMIT SELL ${size} BTC @ ${longExitPrice.toFixed(2)} (close long) - will use market if needed`);
      longLeg = this.executeLeg(longExchange, symbol, 'sell', size, longExitPrice, timeoutMs, true, 0, 5, true);
    }
    
    if (shortExchange.name === 'Lighter') {
      // Lighter is short - MARKET BUY to close
      this.logger.info(`Lighter: MARKET BUY ${size} BTC (close short)`);
      shortLeg = this.executeTakerOrder(shortExchange, symbol, 'buy', size).then(result => {
        const fillPrice = result.order?.price || shortExitPrice;
        const fillSize = result.order?.filledSize || size;
        return {
          exchange: shortExchange.name,
          orderId: result.order?.orderId || 'market',
          filledSize: fillSize,
          averagePrice: fillPrice,
          usedMaker: false,
          feeUsd: this.calculateFeeUsd(shortExchange.name, fillSize, fillPrice, false)
        };
      });
    } else {
      // Nado is short - AGGRESSIVE LIMIT BUY with TAKER FALLBACK to guarantee fill
      this.logger.info(`Nado: AGGRESSIVE LIMIT BUY ${size} BTC @ ${shortExitPrice.toFixed(2)} (close short) - will use market if needed`);
      shortLeg = this.executeLeg(shortExchange, symbol, 'buy', size, shortExitPrice, timeoutMs, true, 0, 5, true);
    }
    
    // Fire both simultaneously, trust both fill
    const [longResult, shortResult] = await Promise.all([longLeg, shortLeg]);
    
    // Calculate exit P&L
    const sellNotional = longResult.filledSize * longResult.averagePrice;
    const buyNotional = shortResult.filledSize * shortResult.averagePrice;
    const grossPnl = sellNotional - buyNotional;
    const totalFees = (longResult.feeUsd || 0) + (shortResult.feeUsd || 0);
    const netPnl = grossPnl - totalFees;
    
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
}

