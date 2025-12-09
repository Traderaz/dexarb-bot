/**
 * Persistent trade logging to disk
 * Saves all completed trades with P&L data to a JSON file
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';

export interface CompletedTrade {
  id: string;
  entryTimestamp: number;
  exitTimestamp: number;
  entryGapUsd: number;
  exitGapUsd: number;
  cheapExchange: string;
  expensiveExchange: string;
  positionSizeBtc: number;
  realizedPnlBtc: number;
  realizedPnlUsd: number;
  holdDurationSeconds: number;
  entryPrices: {
    cheap: number;
    expensive: number;
  };
  exitPrices: {
    long: number;
    short: number;
  };
  fees: {
    entry: number;
    exit: number;
    total: number;
  };
}

export class TradeLogger {
  private logFilePath: string;
  private logger: Logger;
  
  constructor(logger: Logger, logDir: string = './logs') {
    this.logger = logger;
    
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    this.logFilePath = path.join(logDir, 'trades.json');
    
    // Create empty file if it doesn't exist
    if (!fs.existsSync(this.logFilePath)) {
      this.saveTrades([]);
    }
  }
  
  /**
   * Log a completed trade to disk
   */
  logTrade(trade: CompletedTrade): void {
    try {
      const trades = this.loadTrades();
      trades.push(trade);
      this.saveTrades(trades);
      
      this.logger.info(`📝 Trade logged: ${trade.id}`);
      this.logger.info(`   P&L: ${trade.realizedPnlBtc.toFixed(6)} BTC ($${trade.realizedPnlUsd.toFixed(2)})`);
      this.logger.info(`   Fees: $${trade.fees.total.toFixed(2)}`);
      this.logger.info(`   Hold: ${trade.holdDurationSeconds}s`);
    } catch (error) {
      this.logger.error(`Failed to log trade: ${error}`);
    }
  }
  
  /**
   * Get all trades from disk
   */
  loadTrades(): CompletedTrade[] {
    try {
      const data = fs.readFileSync(this.logFilePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      this.logger.warn(`Failed to load trades: ${error}`);
      return [];
    }
  }
  
  /**
   * Save trades to disk
   */
  private saveTrades(trades: CompletedTrade[]): void {
    fs.writeFileSync(this.logFilePath, JSON.stringify(trades, null, 2), 'utf8');
  }
  
  /**
   * Get trading statistics
   */
  getStats(): {
    totalTrades: number;
    totalPnlBtc: number;
    totalPnlUsd: number;
    totalFees: number;
    netPnlUsd: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    avgHoldDuration: number;
    avgPnlPerTrade: number;
  } {
    const trades = this.loadTrades();
    
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        totalPnlBtc: 0,
        totalPnlUsd: 0,
        totalFees: 0,
        netPnlUsd: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        avgHoldDuration: 0,
        avgPnlPerTrade: 0
      };
    }
    
    const totalPnlBtc = trades.reduce((sum, t) => sum + t.realizedPnlBtc, 0);
    const totalPnlUsd = trades.reduce((sum, t) => sum + t.realizedPnlUsd, 0);
    const totalFees = trades.reduce((sum, t) => sum + t.fees.total, 0);
    const netPnlUsd = totalPnlUsd - totalFees;
    const winningTrades = trades.filter(t => (t.realizedPnlUsd - t.fees.total) > 0).length;
    const losingTrades = trades.length - winningTrades;
    const winRate = winningTrades / trades.length;
    const avgHoldDuration = trades.reduce((sum, t) => sum + t.holdDurationSeconds, 0) / trades.length;
    const avgPnlPerTrade = netPnlUsd / trades.length;
    
    return {
      totalTrades: trades.length,
      totalPnlBtc,
      totalPnlUsd,
      totalFees,
      netPnlUsd,
      winningTrades,
      losingTrades,
      winRate,
      avgHoldDuration,
      avgPnlPerTrade
    };
  }
  
  /**
   * Print trading statistics to console
   */
  printStats(): void {
    const stats = this.getStats();
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 TRADING STATISTICS');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Total Trades: ${stats.totalTrades}`);
    console.log(`Winning Trades: ${stats.winningTrades} (${(stats.winRate * 100).toFixed(1)}%)`);
    console.log(`Losing Trades: ${stats.losingTrades}`);
    console.log('');
    console.log(`Gross P&L: ${stats.totalPnlBtc.toFixed(6)} BTC ($${stats.totalPnlUsd.toFixed(2)})`);
    console.log(`Total Fees: $${stats.totalFees.toFixed(2)}`);
    console.log(`Net P&L: $${stats.netPnlUsd.toFixed(2)}`);
    console.log('');
    console.log(`Avg Hold Duration: ${Math.floor(stats.avgHoldDuration / 60)}m ${Math.floor(stats.avgHoldDuration % 60)}s`);
    console.log(`Avg P&L per Trade: $${stats.avgPnlPerTrade.toFixed(2)}`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
  }
}

