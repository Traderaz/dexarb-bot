/**
 * Enhanced Trade Logger with Supabase Integration
 * Logs trades to both local JSON files and Supabase database
 */

import { Logger } from '../utils/logger';
import { getSupabaseClient, DbTrade, DbGap, DbPerformanceMetric } from '../utils/supabase';
import { CompletedTrade, TradeLogger as LocalTradeLogger } from './trade-logger';

export class SupabaseTradeLogger extends LocalTradeLogger {
  private supabase!: ReturnType<typeof getSupabaseClient>;
  private useSupabase: boolean = true;

  constructor(logger: Logger, logDir: string = './logs') {
    super(logger, logDir);
    
    try {
      this.supabase = getSupabaseClient();
      this.logger.info('✅ Supabase connection initialized');
    } catch (error) {
      this.logger.warn(`⚠️ Supabase not available: ${error}. Falling back to local logging only.`);
      this.useSupabase = false;
    }
  }

  /**
   * Log a completed trade to both local file and Supabase
   */
  async logTrade(trade: CompletedTrade): Promise<void> {
    // Always log to local file first
    super.logTrade(trade);

    // Then log to Supabase if available
    if (this.useSupabase) {
      try {
        await this.logTradeToSupabase(trade);
      } catch (error) {
        this.logger.error(`Failed to log trade to Supabase: ${error}`);
      }
    }
  }

  /**
   * Log trade to Supabase database
   */
  private async logTradeToSupabase(trade: CompletedTrade): Promise<void> {
    const dbTrade: DbTrade = {
      trade_id: trade.id,
      entry_timestamp: new Date(trade.entryTimestamp).toISOString(),
      exit_timestamp: new Date(trade.exitTimestamp).toISOString(),
      entry_gap_usd: trade.entryGapUsd,
      exit_gap_usd: trade.exitGapUsd,
      cheap_exchange: trade.cheapExchange,
      expensive_exchange: trade.expensiveExchange,
      position_size_btc: trade.positionSizeBtc,
      realized_pnl_btc: trade.realizedPnlBtc,
      realized_pnl_usd: trade.realizedPnlUsd,
      hold_duration_seconds: trade.holdDurationSeconds,
      entry_price_cheap: trade.entryPrices.cheap,
      entry_price_expensive: trade.entryPrices.expensive,
      exit_price_long: trade.exitPrices.long,
      exit_price_short: trade.exitPrices.short,
      fees_entry: trade.fees.entry,
      fees_exit: trade.fees.exit,
      fees_total: trade.fees.total,
    };

    const { error } = await this.supabase
      .from('trades')
      .insert([dbTrade]);

    if (error) {
      throw new Error(`Supabase insert failed: ${error.message}`);
    }

    this.logger.info(`💾 Trade ${trade.id} saved to Supabase`);
  }

  /**
   * Log a gap/opportunity to Supabase
   */
  async logGap(params: {
    timestamp: Date;
    gapUsd: number;
    cheapExchange: string;
    expensiveExchange: string;
    cheapPrice: number;
    expensivePrice: number;
    fundingRateCheap?: number;
    fundingRateExpensive?: number;
    actionTaken: 'entry' | 'exit' | 'none';
    reason?: string;
  }): Promise<void> {
    if (!this.useSupabase) return;

    try {
      const dbGap: DbGap = {
        timestamp: params.timestamp.toISOString(),
        gap_usd: params.gapUsd,
        cheap_exchange: params.cheapExchange,
        expensive_exchange: params.expensiveExchange,
        cheap_price: params.cheapPrice,
        expensive_price: params.expensivePrice,
        funding_rate_cheap: params.fundingRateCheap || 0,
        funding_rate_expensive: params.fundingRateExpensive || 0,
        action_taken: params.actionTaken,
        reason: params.reason,
      };

      const { error } = await this.supabase
        .from('gaps')
        .insert([dbGap]);

      if (error) {
        throw new Error(`Supabase gap insert failed: ${error.message}`);
      }
    } catch (error) {
      this.logger.error(`Failed to log gap to Supabase: ${error}`);
    }
  }

  /**
   * Save current performance metrics to Supabase
   */
  async savePerformanceSnapshot(): Promise<void> {
    if (!this.useSupabase) return;

    try {
      const stats = this.getStats();

      const dbMetric: DbPerformanceMetric = {
        timestamp: new Date().toISOString(),
        total_trades: stats.totalTrades,
        winning_trades: stats.winningTrades,
        losing_trades: stats.losingTrades,
        win_rate: stats.winRate,
        total_pnl_btc: stats.totalPnlBtc,
        total_pnl_usd: stats.totalPnlUsd,
        total_fees: stats.totalFees,
        net_pnl_usd: stats.netPnlUsd,
        avg_hold_duration_seconds: Math.floor(stats.avgHoldDuration),
        avg_pnl_per_trade: stats.avgPnlPerTrade,
      };

      const { error } = await this.supabase
        .from('performance_metrics')
        .insert([dbMetric]);

      if (error) {
        throw new Error(`Supabase metrics insert failed: ${error.message}`);
      }

      this.logger.info('📊 Performance snapshot saved to Supabase');
    } catch (error) {
      this.logger.error(`Failed to save performance snapshot: ${error}`);
    }
  }

  /**
   * Get recent trades from Supabase
   */
  async getRecentTrades(limit: number = 10): Promise<DbTrade[]> {
    if (!this.useSupabase) return [];

    try {
      const { data, error } = await this.supabase
        .from('trades')
        .select('*')
        .order('entry_timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      this.logger.error(`Failed to fetch recent trades: ${error}`);
      return [];
    }
  }

  /**
   * Get trading statistics from Supabase (aggregated from database)
   */
  async getStatsFromSupabase(): Promise<{
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalPnlUsd: number;
    totalFees: number;
    netPnlUsd: number;
  }> {
    if (!this.useSupabase) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalPnlUsd: 0,
        totalFees: 0,
        netPnlUsd: 0,
      };
    }

    try {
      const { data, error } = await this.supabase
        .from('trades')
        .select('realized_pnl_usd, fees_total');

      if (error) throw new Error(error.message);

      if (!data || data.length === 0) {
        return {
          totalTrades: 0,
          winningTrades: 0,
          losingTrades: 0,
          winRate: 0,
          totalPnlUsd: 0,
          totalFees: 0,
          netPnlUsd: 0,
        };
      }

      const totalTrades = data.length;
      const totalPnlUsd = data.reduce((sum, t) => sum + Number(t.realized_pnl_usd), 0);
      const totalFees = data.reduce((sum, t) => sum + Number(t.fees_total), 0);
      const netPnlUsd = totalPnlUsd - totalFees;
      const winningTrades = data.filter(t => (Number(t.realized_pnl_usd) - Number(t.fees_total)) > 0).length;
      const losingTrades = totalTrades - winningTrades;
      const winRate = winningTrades / totalTrades;

      return {
        totalTrades,
        winningTrades,
        losingTrades,
        winRate,
        totalPnlUsd,
        totalFees,
        netPnlUsd,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch stats from Supabase: ${error}`);
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalPnlUsd: 0,
        totalFees: 0,
        netPnlUsd: 0,
      };
    }
  }
}
