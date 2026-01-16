/**
 * Main strategy logic for cross-exchange basis trading.
 * Implements the state machine (FLAT/OPEN) and trade decision logic.
 */

import { IExchange } from '../exchanges/interface';
import { BotConfig } from '../config/types';
import { Logger } from '../utils/logger';
import { BotStateManager } from './state';
// import { FundingManager } from './funding'; // Disabled - funding check removed
import { ExecutionManager } from './execution';
import { RiskManager } from './risk';
import { TradeLogger, CompletedTrade } from './trade-logger';
import { CsvTradeLogger, TradeLogEntry } from '../utils/csv-logger';

export class BasisTradingStrategy {
  private config: BotConfig;
  private logger: Logger;
  private stateManager: BotStateManager;
  // private _fundingManager: FundingManager; // Unused - funding check disabled
  private executionManager: ExecutionManager;
  private riskManager: RiskManager;
  private tradeLogger: TradeLogger;
  private csvLogger: CsvTradeLogger; // CSV logger for detailed trade records
  private nadoExchange: IExchange;
  private lighterExchange: IExchange;
  private symbol: string;
  private isExecutingTrade: boolean = false; // LOCK to prevent concurrent trades
  
  constructor(
    config: BotConfig,
    nadoExchange: IExchange,
    lighterExchange: IExchange,
    logger: Logger,
    symbol: string = 'BTC-PERP'
  ) {
    this.config = config;
    this.logger = logger;
    this.nadoExchange = nadoExchange;
    this.lighterExchange = lighterExchange;
    this.symbol = symbol;
    
    this.stateManager = new BotStateManager(logger);
    // this._fundingManager = new FundingManager(logger); // Disabled
    this.executionManager = new ExecutionManager(
      logger,
      config.fees?.nadoMakerFeeBps || 1,
      config.fees?.nadoTakerFeeBps || 3.5,
      config.fees?.lighterMakerFeeBps || 0.2,
      config.fees?.lighterTakerFeeBps || 0.2,
      config.execution // Pass execution config for sequential maker mode
    );
    this.riskManager = new RiskManager(config, logger);
    this.tradeLogger = new TradeLogger(logger);
    this.csvLogger = new CsvTradeLogger('./logs');
    this.logger.info(`📊 CSV trade logging enabled: ${this.csvLogger.getLogFilePath()}`);
  }
  
  /**
   * Initialize strategy and reconcile any existing positions.
   * Call this before starting the bot!
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing strategy and checking for existing positions...');
    
    try {
      // Check for existing positions on both exchanges
      const [nadoPosition, lighterPosition] = await Promise.all([
        this.nadoExchange.getPosition(this.symbol),
        this.lighterExchange.getPosition(this.symbol)
      ]);
      
      const nadoSize = Math.abs(nadoPosition?.size || 0);
      const lighterSize = Math.abs(lighterPosition?.size || 0);
      
      if (nadoSize > 0 || lighterSize > 0) {
        this.logger.warn('⚠️  EXISTING POSITIONS DETECTED:');
        this.logger.warn(`   Nado: ${nadoSize} BTC (${nadoPosition?.side || 'none'})`);
        this.logger.warn(`   Lighter: ${lighterSize} BTC (${lighterPosition?.side || 'none'})`);
        
        // Check if positions are balanced (hedged)
        const sizeDiff = Math.abs(nadoSize - lighterSize);
        const tolerance = 0.001; // 0.001 BTC tolerance
        
        if (sizeDiff < tolerance && nadoSize > 0) {
          // Check if they're opposite sides (hedged)
          const isHedged = nadoPosition?.side !== lighterPosition?.side;
          
          if (isHedged) {
            this.logger.warn('   ✓ Positions appear to be hedged');
            this.logger.warn('   Bot will monitor for exit conditions');
            // Mark as OPEN so bot will look for exit
            const [nadoData, lighterData] = await Promise.all([
              this.nadoExchange.getMarketData(this.symbol),
              this.lighterExchange.getMarketData(this.symbol)
            ]);
            
            const gap = Math.abs(nadoData.midPrice - lighterData.midPrice);
            const cheapEx = nadoData.midPrice < lighterData.midPrice ? 'nado' : 'lighter';
            const expEx = nadoData.midPrice < lighterData.midPrice ? 'lighter' : 'nado';
            
            this.stateManager.openPosition(
              gap,
              cheapEx,
              expEx,
              nadoSize,
              nadoData.midPrice,
              lighterData.midPrice
            );
          } else {
            this.logger.error('   ❌ UNHEDGED: Both positions on same side!');
            this.logger.error('   Manual intervention required - bot will NOT trade');
            throw new Error('Unhedged positions detected - same side on both exchanges');
          }
        } else {
          this.logger.error('   ❌ IMBALANCED: Position sizes do not match!');
          this.logger.error(`   Size difference: ${sizeDiff.toFixed(4)} BTC`);
          this.logger.error('   Manual intervention required - bot will NOT trade');
          throw new Error('Imbalanced positions detected');
        }
      } else {
        this.logger.info('✓ No existing positions found - starting fresh');
      }
      
    } catch (error) {
      this.logger.error(`Failed to initialize strategy: ${error}`);
      throw error;
    }
  }
  
  /**
   * Main strategy tick - called on each market data update.
   */
  async onMarketUpdate(): Promise<void> {
    try {
      if (this.stateManager.isFlat()) {
        await this.evaluateEntry();
      } else if (this.stateManager.isOpen()) {
        await this.evaluateExit();
      }
    } catch (error) {
      this.logger.error(`Strategy update error: ${error}`);
    }
  }
  
  /**
   * Evaluate conditions for opening a new spread trade.
   */
  private async evaluateEntry(): Promise<void> {
    // SAFETY CHECK 0: LOCK - Only one trade at a time!
    if (this.isExecutingTrade) {
      this.logger.debug('🔒 Trade execution in progress - skipping entry evaluation');
      return;
    }
    
    // SAFETY CHECK 1: Block trading if recent errors
    if (this.stateManager.shouldBlockTrading()) {
      this.logger.warn('⚠️  Trading blocked due to recent errors - waiting 60s cooldown');
      return;
    }
    
    // SAFETY CHECK 2: Wait for any recent exits to fully process
    const lastExitTime = (this.stateManager as any).lastExitTime || 0;
    if (Date.now() - lastExitTime < 30000) { // 30 seconds cooldown after exit
      this.logger.debug(`⏳ Waiting for recent exit to fully process (${Math.floor((30000 - (Date.now() - lastExitTime)) / 1000)}s remaining)`);
      return;
    }
    
    // SAFETY CHECK 3: Make sure we're actually FLAT before trying to enter
    const lighterPos = await this.lighterExchange.getPosition(this.symbol);
    const nadoPos = await this.nadoExchange.getPosition(this.symbol);
    
    if (lighterPos && nadoPos && (Math.abs(lighterPos.size) > 0.001 || Math.abs(nadoPos.size) > 0.001)) {
      this.logger.warn(`⚠️  Cannot enter - positions already exist! Lighter: ${lighterPos.size}, Nado: ${nadoPos.size}`);
      this.logger.warn(`⚠️  Bot state may be out of sync. Manual intervention required.`);
      
      // If we have positions but state is FLAT, we need to manually close them
      if (this.stateManager.getState() === 'FLAT') {
        this.logger.error('⚠️  State is FLAT but positions exist! Use close-positions.js to close manually.');
      }
      return;
    }
    
    // SAFETY CHECK 2: Verify we actually have no positions
    const [nadoPosition, lighterPosition] = await Promise.all([
      this.nadoExchange.getPosition(this.symbol),
      this.lighterExchange.getPosition(this.symbol)
    ]);
    
    const nadoSize = Math.abs(nadoPosition?.size || 0);
    const lighterSize = Math.abs(lighterPosition?.size || 0);
    
    if (nadoSize > 0.001 || lighterSize > 0.001) {
      this.logger.warn('⚠️  Cannot open new position - existing positions detected:');
      this.logger.warn(`   Nado: ${nadoSize} BTC, Lighter: ${lighterSize} BTC`);
      
      // CRITICAL: Check if BOTH positions exist (hedged) or only ONE (unhedged)
      const onlyNado = nadoSize > 0.001 && lighterSize < 0.001;
      const onlyLighter = lighterSize > 0.001 && nadoSize < 0.001;
      
      if (onlyNado || onlyLighter) {
        // UNHEDGED POSITION DETECTED - AUTO-CLOSE IT
        this.logger.error('🚨 CRITICAL: UNHEDGED POSITION DETECTED!');
        this.logger.error(`   Only ${onlyNado ? 'Nado' : 'Lighter'} has a position!`);
        this.logger.error('   Auto-closing orphaned position to prevent losses...');
        
        try {
          if (onlyNado) {
            // Close Nado position
            const side = nadoPosition!.side === 'long' ? 'sell' : 'buy';
            this.logger.warn(`   Closing Nado ${nadoPosition!.side.toUpperCase()} ${nadoSize} BTC with market order...`);
            await this.nadoExchange.placeMarketOrder(this.symbol, side, nadoSize);
            this.logger.info('   ✓ Nado orphaned position closed');
            
            // Log to CSV
            const csvEntry: TradeLogEntry = {
              timestamp: new Date().toISOString(),
              tradeId: `unhedged-${Date.now()}`,
              action: 'UNHEDGED_CLOSE',
              status: 'UNHEDGED',
              nadoSide: side,
              nadoSize: nadoSize,
              nadoPrice: nadoPosition!.entryPrice,
              nadoFilled: true,
              lighterFilled: false,
              notes: 'Auto-closed unhedged Nado position (Lighter never filled or already closed)'
            };
            this.csvLogger.logTrade(csvEntry);
          } else {
            // Close Lighter position
            const side = lighterPosition!.side === 'long' ? 'sell' : 'buy';
            this.logger.warn(`   Closing Lighter ${lighterPosition!.side.toUpperCase()} ${lighterSize} BTC with market order...`);
            await this.lighterExchange.placeMarketOrder(this.symbol, side, lighterSize);
            this.logger.info('   ✓ Lighter orphaned position closed');
            
            // Log to CSV
            const csvEntry: TradeLogEntry = {
              timestamp: new Date().toISOString(),
              tradeId: `unhedged-${Date.now()}`,
              action: 'UNHEDGED_CLOSE',
              status: 'UNHEDGED',
              lighterSide: side,
              lighterSize: lighterSize,
              lighterPrice: lighterPosition!.entryPrice,
              lighterFilled: true,
              nadoFilled: false,
              notes: 'Auto-closed unhedged Lighter position (Nado never filled or already closed)'
            };
            this.csvLogger.logTrade(csvEntry);
          }
          
          this.logger.info('✅ Orphaned position closed - bot can now trade normally');
          return;
          
        } catch (error) {
          this.logger.error(`❌ FAILED to auto-close orphaned position: ${error}`);
          this.logger.error('   MANUAL INTERVENTION REQUIRED - Close positions manually!');
          throw new Error('Unhedged position detected and auto-close failed');
        }
      }
      
      // Both positions exist - reconstruct state
      this.logger.warn('   Both positions exist - switching to OPEN state to manage them');
      
      // Verify positions are actually hedged (opposite sides)
      const nadoSide = nadoPosition!.side;
      const lighterSide = lighterPosition!.side;
      
      if (nadoSide === lighterSide) {
        this.logger.error('🚨 CRITICAL: Both positions are on the SAME SIDE!');
        this.logger.error(`   Nado: ${nadoSide.toUpperCase()}, Lighter: ${lighterSide.toUpperCase()}`);
        this.logger.error('   This is NOT hedged! Closing both positions...');
        
        try {
          const nadoCloseSide = nadoSide === 'long' ? 'sell' : 'buy';
          const lighterCloseSide = lighterSide === 'long' ? 'sell' : 'buy';
          
          await Promise.all([
            this.nadoExchange.placeMarketOrder(this.symbol, nadoCloseSide, nadoSize),
            this.lighterExchange.placeMarketOrder(this.symbol, lighterCloseSide, lighterSize)
          ]);
          
          this.logger.info('✅ Both same-side positions closed');
          return;
          
        } catch (error) {
          this.logger.error(`❌ FAILED to close same-side positions: ${error}`);
          throw new Error('Same-side positions detected and auto-close failed');
        }
      }
      
      // Positions are properly hedged - reconstruct state
      const [nadoData, lighterData] = await Promise.all([
        this.nadoExchange.getMarketData(this.symbol),
        this.lighterExchange.getMarketData(this.symbol)
      ]);
      
      const gap = Math.abs(nadoData.midPrice - lighterData.midPrice);
      
      // Determine which is long and which is short based on ACTUAL positions
      const cheapEx = nadoSide === 'long' ? 'nado' : 'lighter';
      const expEx = nadoSide === 'long' ? 'lighter' : 'nado';
      
      this.stateManager.openPosition(
        gap,
        cheapEx,
        expEx,
        Math.max(nadoSize, lighterSize),
        nadoData.midPrice,
        lighterData.midPrice
      );
      
      this.logger.info(`✓ State reconstructed: LONG on ${cheapEx}, SHORT on ${expEx}`);
      return;
    }
    
    // Get current market data from both exchanges
    const [nadoData, lighterData] = await Promise.all([
      this.nadoExchange.getMarketData(this.symbol),
      this.lighterExchange.getMarketData(this.symbol)
    ]);
    
    const nadoPrice = nadoData.midPrice;
    const lighterPrice = lighterData.midPrice;
    
    // Determine which exchange is cheaper and which is more expensive
    let cheapExchange: IExchange;
    let expensiveExchange: IExchange;
    let cheapExchangeName: 'nado' | 'lighter';
    let expensiveExchangeName: 'nado' | 'lighter';
    let cheapPrice: number;
    let expensivePrice: number;
    
    // For accurate P&L: use ASK price (what we pay when buying) and BID price (what we get when selling)
    let cheapBuyPrice: number;  // ASK on cheap exchange (we buy here)
    let expensiveSellPrice: number;  // BID on expensive exchange (we sell here)
    
    if (nadoPrice < lighterPrice) {
      cheapExchange = this.nadoExchange;
      expensiveExchange = this.lighterExchange;
      cheapExchangeName = 'nado';
      expensiveExchangeName = 'lighter';
      cheapPrice = nadoPrice;
      expensivePrice = lighterPrice;
      cheapBuyPrice = nadoData.askPrice;  // Buying on Nado = pay ask
      expensiveSellPrice = lighterData.bidPrice;  // Selling on Lighter = get bid
    } else {
      cheapExchange = this.lighterExchange;
      expensiveExchange = this.nadoExchange;
      cheapExchangeName = 'lighter';
      expensiveExchangeName = 'nado';
      cheapPrice = lighterPrice;
      expensivePrice = nadoPrice;
      cheapBuyPrice = lighterData.askPrice;  // Buying on Lighter = pay ask
      expensiveSellPrice = nadoData.bidPrice;  // Selling on Nado = get bid
    }
    
    const gapUsd = expensivePrice - cheapPrice;
    
    // Calculate REALISTIC gap (what we'll actually capture after bid/ask spread)
    const realisticGap = expensiveSellPrice - cheapBuyPrice;
    
    // Log current gap at INFO level (visible always)
    this.logger.info(
      `📊 Current Gap: ${gapUsd.toFixed(2)} USD | ` +
      `${cheapExchangeName}: $${cheapPrice.toFixed(2)} → ${expensiveExchangeName}: $${expensivePrice.toFixed(2)} | ` +
      `Entry threshold: $${this.config.entryGapUsd}`
    );
    
    this.logger.debug(
      `Realistic gap (after spread): ${realisticGap.toFixed(2)} USD ` +
      `(${cheapExchangeName}: buy@${cheapBuyPrice.toFixed(2)}, ${expensiveExchangeName}: sell@${expensiveSellPrice.toFixed(2)})`
    );
    
    // Check 1: Gap threshold (minimum)
    if (gapUsd < this.config.entryGapUsd) {
      return;
    }
    
    this.logger.info(`GAP DETECTED: ${gapUsd.toFixed(2)} USD >= ${this.config.entryGapUsd} USD threshold`);
    
    // Check 1b: Gap threshold (maximum) - skip extremely volatile gaps
    const maxGap = (this.config as any).maxEntryGapUsd || 999999;
    if (gapUsd > maxGap) {
      this.logger.warn(`⚠️  GAP TOO LARGE: ${gapUsd.toFixed(2)} USD > ${maxGap} USD max threshold`);
      this.logger.warn(`   Skipping trade - gap indicates extreme volatility and high risk of partial fills`);
      return;
    }
    
    // Check 2: Funding rate check (DISABLED - user requested to ignore funding)
    this.logger.info(`Funding check SKIPPED (disabled by user)`);
    
    // Check 3: Risk checks (margin, liquidity, slippage)
    const riskCheck = await this.riskManager.preTradeCheck(
      cheapExchange,
      expensiveExchange,
      this.symbol,
      this.config.positionSizeBtc,
      cheapPrice,
      expensivePrice,
      10 // max 0.1% slippage
    );
    
    if (!riskCheck.passed) {
      this.logger.warn(`Risk check FAILED: ${riskCheck.reason}`);
      return;
    }
    
    // All checks passed - execute entry
    this.logger.info('ALL ENTRY CONDITIONS MET - EXECUTING SPREAD ENTRY');
    
    await this.executeEntry(
      cheapExchange,
      expensiveExchange,
      cheapExchangeName,
      expensiveExchangeName,
      cheapBuyPrice,       // Pass realistic ask price
      expensiveSellPrice,  // Pass realistic bid price
      realisticGap         // Pass realistic gap for tracking
    );
  }
  
  /**
   * Execute spread entry.
   */
  private async executeEntry(
    cheapExchange: IExchange,
    expensiveExchange: IExchange,
    cheapExchangeName: 'nado' | 'lighter',
    expensiveExchangeName: 'nado' | 'lighter',
    cheapBuyPrice: number,       // ASK price on cheap exchange (what we pay)
    expensiveSellPrice: number,  // BID price on expensive exchange (what we get)
    gapUsd: number
  ): Promise<void> {
    // SET LOCK - Prevent concurrent trade execution
    this.isExecutingTrade = true;
    this.logger.info('🔒 LOCK ACQUIRED - No new trades until this completes');
    
    try {
      // Use realistic bid/ask prices for accurate P&L tracking
      const result = await this.executionManager.executeSpreadEntry(
        cheapExchange,
        expensiveExchange,
        this.symbol,
        this.config.positionSizeBtc,
        cheapBuyPrice,           // ASK price (what we actually pay when buying)
        expensiveSellPrice,      // BID price (what we actually get when selling)
        this.config.entryTimeoutMs,
        false // NO fallback - if limits don't fill instantly, stop (user manages manually)
      );
      
      // TRUST THE EXECUTION - Record position immediately
      // Note: Position verification disabled due to unreliable exchange APIs
      // The LOCK mechanism above ensures only ONE trade executes at a time
      this.logger.info('✓ Orders placed successfully - Recording position in state');
      
      // Record the opened position
      this.stateManager.openPosition(
        gapUsd,
        cheapExchangeName,
        expensiveExchangeName,
        this.config.positionSizeBtc,
        result.cheapLeg.averagePrice,
        result.expensiveLeg.averagePrice
      );
      
      this.stateManager.updateOrderIds(
        result.cheapLeg.orderId,
        result.expensiveLeg.orderId
      );
      
      // Log to CSV with entry details
      const tradeId = `trade-${Date.now()}`;
      const csvEntry: TradeLogEntry = {
        timestamp: new Date().toISOString(),
        tradeId,
        action: 'ENTRY',
        status: 'SUCCESS',
        entryGapUsd: gapUsd,
        lighterSide: cheapExchangeName === 'lighter' ? 'buy' : 'sell',
        lighterOrderId: cheapExchangeName === 'lighter' ? result.cheapLeg.orderId : result.expensiveLeg.orderId,
        lighterSize: this.config.positionSizeBtc,
        lighterPrice: cheapExchangeName === 'lighter' ? result.cheapLeg.averagePrice : result.expensiveLeg.averagePrice,
        lighterFilled: true,
        lighterFeeUsd: cheapExchangeName === 'lighter' ? 0 : 0, // Lighter entry fees are 0
        nadoSide: cheapExchangeName === 'nado' ? 'buy' : 'sell',
        nadoOrderId: cheapExchangeName === 'nado' ? result.cheapLeg.orderId : result.expensiveLeg.orderId,
        nadoSize: this.config.positionSizeBtc,
        nadoPrice: cheapExchangeName === 'nado' ? result.cheapLeg.averagePrice : result.expensiveLeg.averagePrice,
        nadoFilled: true,
        nadoFeeUsd: cheapExchangeName === 'nado' 
          ? (this.config.fees.nadoMakerFeeBps / 10000) * result.cheapLeg.averagePrice * this.config.positionSizeBtc
          : (this.config.fees.nadoMakerFeeBps / 10000) * result.expensiveLeg.averagePrice * this.config.positionSizeBtc,
        notes: `LONG ${cheapExchangeName} @ ${result.cheapLeg.averagePrice.toFixed(2)}, SHORT ${expensiveExchangeName} @ ${result.expensiveLeg.averagePrice.toFixed(2)}`
      };
      this.csvLogger.logTrade(csvEntry);
      
      this.logger.info(
        `✓ SPREAD OPENED: Entry gap ${gapUsd.toFixed(2)} USD, ` +
        `LONG ${this.config.positionSizeBtc} on ${cheapExchangeName} @ ${result.cheapLeg.averagePrice.toFixed(2)}, ` +
        `SHORT ${this.config.positionSizeBtc} on ${expensiveExchangeName} @ ${result.expensiveLeg.averagePrice.toFixed(2)}`
      );
      
      // RELEASE LOCK - Trade completed successfully
      this.isExecutingTrade = false;
      this.logger.info('🔓 LOCK RELEASED - Bot can now monitor for exit or new entry');
      
    } catch (error) {
      this.logger.error(`FAILED TO EXECUTE ENTRY: ${error}`);
      
      // RELEASE LOCK on error too
      this.isExecutingTrade = false;
      this.logger.warn('🔓 LOCK RELEASED (error occurred)');
      
      // Record error to prevent immediate retries
      this.stateManager.recordError();
      this.logger.warn('⚠️  Blocking new trades for 60 seconds after error');
      
      // Emergency: check if we have partial positions and try to close them
      await this.handlePartialFillEmergency();
    }
  }
  
  /**
   * Evaluate conditions for closing the current spread trade.
   */
  private async evaluateExit(): Promise<void> {
    // SAFETY CHECK: LOCK - Don't evaluate exit if another trade is executing
    if (this.isExecutingTrade) {
      this.logger.debug('🔒 Trade execution in progress - skipping exit evaluation');
      return;
    }
    
    const position = this.stateManager.getCurrentPosition();
    if (!position) {
      this.logger.error('evaluateExit called but no position exists');
      return;
    }
    
    const holdDuration = this.stateManager.getHoldDurationSeconds();
    
    // Check minimum hold duration
    if (holdDuration < this.config.minHoldDurationSeconds) {
      this.logger.debug(
        `Hold duration ${holdDuration}s < min ${this.config.minHoldDurationSeconds}s, not checking exit yet`
      );
      return;
    }
    
    // Get current prices for the same exchanges as entry
    const cheapExchange = position.cheapExchange === 'nado' ? this.nadoExchange : this.lighterExchange;
    const expensiveExchange = position.expensiveExchange === 'nado' ? this.nadoExchange : this.lighterExchange;
    
    const [cheapData, expensiveData] = await Promise.all([
      cheapExchange.getMarketData(this.symbol),
      expensiveExchange.getMarketData(this.symbol)
    ]);
    
    const currentCheapPrice = cheapData.midPrice;
    const currentExpensivePrice = expensiveData.midPrice;
    const currentGapUsd = currentExpensivePrice - currentCheapPrice;
    
    this.logger.info(
      `Exit monitoring: Current gap ${currentGapUsd.toFixed(2)} USD ` +
      `(entry: ${position.entryGapUsd.toFixed(2)} USD, exit threshold: ${this.config.exitGapUsd} USD, hold: ${holdDuration}s)`
    );
    
    // Check exit condition: gap has compressed to exit threshold
    if (currentGapUsd <= this.config.exitGapUsd) {
      this.logger.info(
        `EXIT CONDITION MET: Current gap ${currentGapUsd.toFixed(2)} USD <= ` +
        `exit threshold ${this.config.exitGapUsd} USD`
      );
      
      await this.executeExit(
        cheapExchange,
        expensiveExchange,
        currentCheapPrice,
        currentExpensivePrice,
        currentGapUsd
      );
      return;
    }
    
    // Check optional max hold duration
    if (this.config.maxHoldDurationSeconds && 
        holdDuration >= this.config.maxHoldDurationSeconds) {
      this.logger.info(
        `MAX HOLD DURATION REACHED: ${holdDuration}s >= ${this.config.maxHoldDurationSeconds}s. ` +
        `Exiting position (current gap: ${currentGapUsd.toFixed(2)} USD)`
      );
      
      await this.executeExit(
        cheapExchange,
        expensiveExchange,
        currentCheapPrice,
        currentExpensivePrice,
        currentGapUsd
      );
    }
  }
  
  /**
   * Execute spread exit.
   */
  private async executeExit(
    longExchange: IExchange,
    shortExchange: IExchange,
    longExitPrice: number,
    shortExitPrice: number,
    exitGapUsd: number
  ): Promise<void> {
    const position = this.stateManager.getCurrentPosition();
    if (!position) {
      this.logger.error('executeExit called but no position exists');
      return;
    }
    
    // SET LOCK - Prevent concurrent trade execution (including new entries during exit)
    this.isExecutingTrade = true;
    this.logger.info('🔒 LOCK ACQUIRED (EXIT) - No new trades until exit completes');
    
    try {
      const result = await this.executionManager.executeSpreadExit(
        longExchange,
        shortExchange,
        this.symbol,
        this.config.positionSizeBtc,
        longExitPrice,
        shortExitPrice,
        this.config.exitTimeoutMs,
        false // NO fallback - if limits don't fill instantly, stop (user manages manually)
      );
      
      // TRUST THE EXECUTION - Record closure immediately
      // Note: Position verification disabled due to unreliable exchange APIs
      this.logger.info('✓ Exit orders placed successfully - Recording closure in state');
      
      // Calculate realized PnL
      // Long side: (exit price - entry price) * size
      // Short side: (entry price - exit price) * size
      // Total: entry gap - exit gap (in price terms)
      const longPnl = (result.longLeg.averagePrice - position.cheapExchangePrice) * this.config.positionSizeBtc;
      const shortPnl = (position.expensiveExchangePrice - result.shortLeg.averagePrice) * this.config.positionSizeBtc;
      const realizedPnlUsd = longPnl + shortPnl;
      const realizedPnlBtc = realizedPnlUsd / ((position.cheapExchangePrice + position.expensiveExchangePrice) / 2);
      
      // Calculate actual fees based on maker/taker usage
      // Entry fees: Nado uses maker (limit), Lighter uses market (taker but 0% fee)
      const nadoEntryFee = (this.config.fees.nadoMakerFeeBps / 10000) * 
        (position.cheapExchange === 'nado' ? position.cheapExchangePrice : position.expensiveExchangePrice) * 
        this.config.positionSizeBtc;
      const lighterEntryFee = 0; // Lighter market orders are free
      const entryFeesUsd = nadoEntryFee + lighterEntryFee;
      
      // Exit fees (calculate based on actual execution)
      const exitLongFee = result.longLeg.exchange === 'Lighter' 
        ? 0 // Lighter market orders are free (0% taker)
        : (result.longLeg.usedMaker ? this.config.fees.nadoMakerFeeBps : this.config.fees.nadoTakerFeeBps) / 10000 * result.longLeg.averagePrice * this.config.positionSizeBtc;
      
      const exitShortFee = result.shortLeg.exchange === 'Lighter'
        ? 0 // Lighter market orders are free (0% taker)
        : (result.shortLeg.usedMaker ? this.config.fees.nadoMakerFeeBps : this.config.fees.nadoTakerFeeBps) / 10000 * result.shortLeg.averagePrice * this.config.positionSizeBtc;
      
      const exitFeesUsd = exitLongFee + exitShortFee;
      const totalFeesUsd = entryFeesUsd + exitFeesUsd;
      
      // Close the position in state
      this.stateManager.closePosition(exitGapUsd, realizedPnlBtc);
      
      // Log completed trade to disk with fees
      const trade: CompletedTrade = {
        id: `trade-${position.entryTimestamp}`,
        entryTimestamp: position.entryTimestamp,
        exitTimestamp: Date.now(),
        entryGapUsd: position.entryGapUsd,
        exitGapUsd,
        cheapExchange: position.cheapExchange,
        expensiveExchange: position.expensiveExchange,
        positionSizeBtc: this.config.positionSizeBtc,
        realizedPnlBtc,
        realizedPnlUsd,
        holdDurationSeconds: Math.floor((Date.now() - position.entryTimestamp) / 1000),
        entryPrices: {
          cheap: position.cheapExchangePrice,
          expensive: position.expensiveExchangePrice
        },
        exitPrices: {
          long: result.longLeg.averagePrice,
          short: result.shortLeg.averagePrice
        },
        fees: {
          entry: entryFeesUsd,
          exit: exitFeesUsd,
          total: totalFeesUsd
        }
      };
      
      this.tradeLogger.logTrade(trade);
      
      // Log to CSV with detailed information
      const csvEntry: TradeLogEntry = {
        timestamp: new Date().toISOString(),
        tradeId: trade.id,
        action: 'EXIT',
        status: 'SUCCESS',
        entryGapUsd: position.entryGapUsd,
        exitGapUsd,
        holdDurationSeconds: trade.holdDurationSeconds,
        lighterSide: position.cheapExchange === 'lighter' ? 'buy' : 'sell',
        lighterSize: this.config.positionSizeBtc,
        lighterPrice: position.cheapExchange === 'lighter' ? position.cheapExchangePrice : position.expensiveExchangePrice,
        lighterFilled: true,
        lighterFeeUsd: position.cheapExchange === 'lighter' ? lighterEntryFee : 0,
        nadoSide: position.cheapExchange === 'nado' ? 'buy' : 'sell',
        nadoSize: this.config.positionSizeBtc,
        nadoPrice: position.cheapExchange === 'nado' ? position.cheapExchangePrice : position.expensiveExchangePrice,
        nadoFilled: true,
        nadoFeeUsd: nadoEntryFee,
        grossPnlUsd: realizedPnlUsd,
        totalFeesUsd,
        netPnlUsd: realizedPnlUsd - totalFeesUsd,
        netPnlBtc: realizedPnlBtc,
        notes: `Entry: ${position.cheapExchange} @ ${position.cheapExchangePrice.toFixed(2)}, ${position.expensiveExchange} @ ${position.expensiveExchangePrice.toFixed(2)}`
      };
      this.csvLogger.logTrade(csvEntry);
      
      // RELEASE LOCK - Exit completed successfully
      this.isExecutingTrade = false;
      this.logger.info('🔓 LOCK RELEASED (EXIT) - Bot can now enter new positions');
      
      const netPnlUsd = realizedPnlUsd - totalFeesUsd;
      this.logger.info(
        `✓ SPREAD CLOSED: Exit gap ${exitGapUsd.toFixed(2)} USD, ` +
        `Gross PnL: $${realizedPnlUsd.toFixed(2)}, Fees: $${totalFeesUsd.toFixed(2)}, ` +
        `Net PnL: $${netPnlUsd.toFixed(2)}, ` +
        `Entry gap was ${position.entryGapUsd.toFixed(2)} USD`
      );
      
    } catch (error) {
      this.logger.error(`FAILED TO EXECUTE EXIT: ${error}`);
      
      // RELEASE LOCK on error too
      this.isExecutingTrade = false;
      this.logger.warn('🔓 LOCK RELEASED (exit error occurred)');
      
      // This is critical - we need to keep trying to close or alert the operator
      this.logger.error(
        '\n' +
        '🚨🚨🚨 CRITICAL ALERT 🚨🚨🚨\n' +
        '═══════════════════════════════════════════════════════════\n' +
        '  EXIT FAILED - POSITION MAY BE UNHEDGED!\n' +
        '  \n' +
        '  One or both legs may have failed to close.\n' +
        '  CHECK YOUR POSITIONS IMMEDIATELY:\n' +
        '  \n' +
        '  1. Go to Nado and check if SHORT is still open\n' +
        '  2. Go to Lighter and check if LONG is still open\n' +
        '  3. If only ONE side closed, you have BTC price exposure!\n' +
        '  4. Manually close any remaining positions NOW!\n' +
        '  \n' +
        '  Error details: ' + error + '\n' +
        '═══════════════════════════════════════════════════════════\n'
      );
      
      // Don't change state - keep it as OPEN so bot won't try to enter again
      this.logger.warn('⚠️  State remains OPEN - bot will NOT enter new trades');
      this.logger.warn('⚠️  Manually fix positions and restart bot when ready');
    }
  }
  
  /**
   * Handle emergency situation where only one leg filled.
   */
  private async handlePartialFillEmergency(): Promise<void> {
    this.logger.error('Handling partial fill emergency...');
    
    try {
      // Check positions on both exchanges
      const [nadoPosition, lighterPosition] = await Promise.all([
        this.nadoExchange.getPosition(this.symbol),
        this.lighterExchange.getPosition(this.symbol)
      ]);
      
      // If we have a position on one exchange but not the other, close it immediately
      if (nadoPosition && !lighterPosition) {
        this.logger.warn('Detected position on Nado only - closing with market order');
        const side = nadoPosition.side === 'long' ? 'sell' : 'buy';
        await this.nadoExchange.placeMarketOrder(
          this.symbol,
          side,
          nadoPosition.size,
          { reduceOnly: true }
        );
        
        // Log emergency closure to CSV
        const csvEntry: TradeLogEntry = {
          timestamp: new Date().toISOString(),
          tradeId: `emergency-${Date.now()}`,
          action: 'EMERGENCY_CLOSE',
          status: 'PARTIAL',
          nadoSide: side,
          nadoSize: nadoPosition.size,
          nadoPrice: nadoPosition.entryPrice,
          nadoFilled: true,
          lighterFilled: false,
          notes: 'Emergency closure: Nado position only (Lighter failed to fill)'
        };
        this.csvLogger.logTrade(csvEntry);
      } else if (lighterPosition && !nadoPosition) {
        this.logger.warn('Detected position on Lighter only - closing with market order');
        const side = lighterPosition.side === 'long' ? 'sell' : 'buy';
        await this.lighterExchange.placeMarketOrder(
          this.symbol,
          side,
          lighterPosition.size,
          { reduceOnly: true }
        );
        
        // Log emergency closure to CSV
        const csvEntry: TradeLogEntry = {
          timestamp: new Date().toISOString(),
          tradeId: `emergency-${Date.now()}`,
          action: 'EMERGENCY_CLOSE',
          status: 'PARTIAL',
          lighterSide: side,
          lighterSize: lighterPosition.size,
          lighterPrice: lighterPosition.entryPrice,
          lighterFilled: true,
          nadoFilled: false,
          notes: 'Emergency closure: Lighter position only (Nado failed to fill)'
        };
        this.csvLogger.logTrade(csvEntry);
      }
      
      this.logger.info('Partial fill emergency handled');
      
    } catch (error) {
      this.logger.error(`Failed to handle partial fill emergency: ${error}`);
      this.logger.error('CRITICAL: Manual intervention required!');
    }
  }
  
  /**
   * Get current strategy status.
   */
  getStatus(): {
    state: string;
    position: any;
    stats: any;
  } {
    return {
      state: this.stateManager.getState(),
      position: this.stateManager.getCurrentPosition(),
      stats: this.stateManager.getTradeStats()
    };
  }
  
  /**
   * Log current status.
   */
  logStatus(): void {
    this.stateManager.logStatus();
  }
}

