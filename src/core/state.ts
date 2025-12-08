/**
 * State management for the basis trading bot.
 * Tracks current position state, entry details, and trade history.
 */

import { Logger } from '../utils/logger';

export type BotState = 'FLAT' | 'OPEN';

export interface SpreadPosition {
  state: BotState;
  entryGapUsd: number;
  entryTimestamp: number;
  cheapExchange: 'nado' | 'lighter';
  expensiveExchange: 'nado' | 'lighter';
  positionSizeBtc: number;
  cheapExchangePrice: number;
  expensiveExchangePrice: number;
  cheapExchangeOrderId?: string;
  expensiveExchangeOrderId?: string;
}

export interface TradeHistory {
  id: string;
  entryTimestamp: number;
  exitTimestamp: number;
  entryGapUsd: number;
  exitGapUsd: number;
  cheapExchange: string;
  expensiveExchange: string;
  positionSizeBtc: number;
  realizedPnl: number;
  holdDurationSeconds: number;
}

export class BotStateManager {
  private currentState: BotState = 'FLAT';
  private currentPosition: SpreadPosition | null = null;
  private tradeHistory: TradeHistory[] = [];
  private logger: Logger;
  private errorCount: number = 0;
  private lastErrorTime: number = 0;
  
  constructor(logger: Logger) {
    this.logger = logger;
  }
  
  recordError(): void {
    this.errorCount++;
    this.lastErrorTime = Date.now();
  }
  
  shouldBlockTrading(): boolean {
    // Block trading if we've had errors in the last 60 seconds
    if (this.errorCount > 0 && Date.now() - this.lastErrorTime < 60000) {
      return true;
    }
    // Reset error count after 60 seconds
    if (Date.now() - this.lastErrorTime >= 60000) {
      this.errorCount = 0;
    }
    return false;
  }
  
  getState(): BotState {
    return this.currentState;
  }
  
  isFlat(): boolean {
    return this.currentState === 'FLAT';
  }
  
  isOpen(): boolean {
    return this.currentState === 'OPEN';
  }
  
  getCurrentPosition(): SpreadPosition | null {
    return this.currentPosition;
  }
  
  openPosition(
    entryGapUsd: number,
    cheapExchange: 'nado' | 'lighter',
    expensiveExchange: 'nado' | 'lighter',
    positionSizeBtc: number,
    cheapExchangePrice: number,
    expensiveExchangePrice: number
  ): void {
    if (this.currentState !== 'FLAT') {
      throw new Error('Cannot open position: already in OPEN state');
    }
    
    this.currentPosition = {
      state: 'OPEN',
      entryGapUsd,
      entryTimestamp: Date.now(),
      cheapExchange,
      expensiveExchange,
      positionSizeBtc,
      cheapExchangePrice,
      expensiveExchangePrice
    };
    
    this.currentState = 'OPEN';
    
    this.logger.info(
      `Position OPENED: ${entryGapUsd.toFixed(2)} USD gap, ` +
      `LONG ${positionSizeBtc} BTC on ${cheapExchange} @ ${cheapExchangePrice.toFixed(2)}, ` +
      `SHORT ${positionSizeBtc} BTC on ${expensiveExchange} @ ${expensiveExchangePrice.toFixed(2)}`
    );
  }
  
  updateOrderIds(cheapExchangeOrderId: string, expensiveExchangeOrderId: string): void {
    if (!this.currentPosition) {
      throw new Error('No current position to update');
    }
    
    this.currentPosition.cheapExchangeOrderId = cheapExchangeOrderId;
    this.currentPosition.expensiveExchangeOrderId = expensiveExchangeOrderId;
  }
  
  closePosition(exitGapUsd: number, realizedPnl: number): void {
    if (this.currentState !== 'OPEN' || !this.currentPosition) {
      throw new Error('Cannot close position: not in OPEN state');
    }
    
    const exitTimestamp = Date.now();
    const holdDurationSeconds = Math.floor((exitTimestamp - this.currentPosition.entryTimestamp) / 1000);
    
    const trade: TradeHistory = {
      id: `trade-${this.currentPosition.entryTimestamp}`,
      entryTimestamp: this.currentPosition.entryTimestamp,
      exitTimestamp,
      entryGapUsd: this.currentPosition.entryGapUsd,
      exitGapUsd,
      cheapExchange: this.currentPosition.cheapExchange,
      expensiveExchange: this.currentPosition.expensiveExchange,
      positionSizeBtc: this.currentPosition.positionSizeBtc,
      realizedPnl,
      holdDurationSeconds
    };
    
    this.tradeHistory.push(trade);
    this.currentPosition = null;
    this.currentState = 'FLAT';
    (this as any).lastExitTime = Date.now(); // Track exit time for cooldown
    
    this.logger.info(
      `Position CLOSED: Exit gap ${exitGapUsd.toFixed(2)} USD, ` +
      `Hold duration ${holdDurationSeconds}s, ` +
      `Realized PnL: ${realizedPnl.toFixed(4)} BTC (${(realizedPnl * 45000).toFixed(2)} USD est.)`
    );
  }
  
  getHoldDurationSeconds(): number {
    if (!this.currentPosition) {
      return 0;
    }
    return Math.floor((Date.now() - this.currentPosition.entryTimestamp) / 1000);
  }
  
  getTradeHistory(): TradeHistory[] {
    return [...this.tradeHistory];
  }
  
  getTradeStats(): {
    totalTrades: number;
    totalPnl: number;
    averageHoldDuration: number;
    winRate: number;
  } {
    if (this.tradeHistory.length === 0) {
      return {
        totalTrades: 0,
        totalPnl: 0,
        averageHoldDuration: 0,
        winRate: 0
      };
    }
    
    const totalPnl = this.tradeHistory.reduce((sum, t) => sum + t.realizedPnl, 0);
    const avgHoldDuration = this.tradeHistory.reduce((sum, t) => sum + t.holdDurationSeconds, 0) / this.tradeHistory.length;
    const winningTrades = this.tradeHistory.filter(t => t.realizedPnl > 0).length;
    const winRate = winningTrades / this.tradeHistory.length;
    
    return {
      totalTrades: this.tradeHistory.length,
      totalPnl,
      averageHoldDuration: avgHoldDuration,
      winRate
    };
  }
  
  logStatus(): void {
    if (this.currentState === 'FLAT') {
      this.logger.info('Status: FLAT (no open position)');
    } else if (this.currentPosition) {
      const holdDuration = this.getHoldDurationSeconds();
      this.logger.info(
        `Status: OPEN | Entry gap: ${this.currentPosition.entryGapUsd.toFixed(2)} USD | ` +
        `Hold: ${holdDuration}s | ` +
        `Long ${this.currentPosition.cheapExchange}, Short ${this.currentPosition.expensiveExchange}`
      );
    }
    
    const stats = this.getTradeStats();
    if (stats.totalTrades > 0) {
      this.logger.info(
        `Stats: ${stats.totalTrades} trades, ` +
        `Total PnL: ${stats.totalPnl.toFixed(4)} BTC, ` +
        `Avg hold: ${stats.averageHoldDuration.toFixed(0)}s, ` +
        `Win rate: ${(stats.winRate * 100).toFixed(1)}%`
      );
    }
  }
}

