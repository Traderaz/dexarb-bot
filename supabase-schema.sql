-- Supabase Database Schema for DEX Arbitrage Bot
-- Run this in Supabase SQL Editor to create tables

-- ==========================================
-- TRADES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS trades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trade_id TEXT NOT NULL UNIQUE,
  entry_timestamp TIMESTAMPTZ NOT NULL,
  exit_timestamp TIMESTAMPTZ NOT NULL,
  entry_gap_usd NUMERIC(20, 2) NOT NULL,
  exit_gap_usd NUMERIC(20, 2) NOT NULL,
  cheap_exchange TEXT NOT NULL,
  expensive_exchange TEXT NOT NULL,
  position_size_btc NUMERIC(20, 8) NOT NULL,
  realized_pnl_btc NUMERIC(20, 8) NOT NULL,
  realized_pnl_usd NUMERIC(20, 2) NOT NULL,
  hold_duration_seconds INTEGER NOT NULL,
  entry_price_cheap NUMERIC(20, 2) NOT NULL,
  entry_price_expensive NUMERIC(20, 2) NOT NULL,
  exit_price_long NUMERIC(20, 2) NOT NULL,
  exit_price_short NUMERIC(20, 2) NOT NULL,
  fees_entry NUMERIC(20, 2) NOT NULL,
  fees_exit NUMERIC(20, 2) NOT NULL,
  fees_total NUMERIC(20, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_trades_entry_timestamp ON trades(entry_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_trades_trade_id ON trades(trade_id);

-- ==========================================
-- GAPS TABLE (Market Opportunities)
-- ==========================================
CREATE TABLE IF NOT EXISTS gaps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  gap_usd NUMERIC(20, 2) NOT NULL,
  cheap_exchange TEXT NOT NULL,
  expensive_exchange TEXT NOT NULL,
  cheap_price NUMERIC(20, 2) NOT NULL,
  expensive_price NUMERIC(20, 2) NOT NULL,
  funding_rate_cheap NUMERIC(10, 6),
  funding_rate_expensive NUMERIC(10, 6),
  action_taken TEXT NOT NULL CHECK (action_taken IN ('entry', 'exit', 'none')),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_gaps_timestamp ON gaps(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_gaps_action ON gaps(action_taken);

-- ==========================================
-- PERFORMANCE METRICS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS performance_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  total_trades INTEGER NOT NULL DEFAULT 0,
  winning_trades INTEGER NOT NULL DEFAULT 0,
  losing_trades INTEGER NOT NULL DEFAULT 0,
  win_rate NUMERIC(5, 4),
  total_pnl_btc NUMERIC(20, 8),
  total_pnl_usd NUMERIC(20, 2),
  total_fees NUMERIC(20, 2),
  net_pnl_usd NUMERIC(20, 2),
  avg_hold_duration_seconds INTEGER,
  avg_pnl_per_trade NUMERIC(20, 2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for latest metrics
CREATE INDEX IF NOT EXISTS idx_performance_timestamp ON performance_metrics(timestamp DESC);

-- ==========================================
-- VIEWS FOR EASY QUERYING
-- ==========================================

-- Daily performance summary
CREATE OR REPLACE VIEW daily_performance AS
SELECT 
  DATE(entry_timestamp) as trade_date,
  COUNT(*) as total_trades,
  SUM(CASE WHEN (realized_pnl_usd - fees_total) > 0 THEN 1 ELSE 0 END) as winning_trades,
  SUM(CASE WHEN (realized_pnl_usd - fees_total) <= 0 THEN 1 ELSE 0 END) as losing_trades,
  ROUND(AVG(CASE WHEN (realized_pnl_usd - fees_total) > 0 THEN 1.0 ELSE 0.0 END)::numeric, 4) as win_rate,
  SUM(realized_pnl_btc) as total_pnl_btc,
  SUM(realized_pnl_usd) as total_pnl_usd,
  SUM(fees_total) as total_fees,
  SUM(realized_pnl_usd - fees_total) as net_pnl_usd,
  AVG(hold_duration_seconds)::integer as avg_hold_duration_seconds
FROM trades
GROUP BY DATE(entry_timestamp)
ORDER BY trade_date DESC;

-- Hourly gap analysis
CREATE OR REPLACE VIEW hourly_gaps AS
SELECT 
  DATE_TRUNC('hour', timestamp) as hour,
  COUNT(*) as gap_count,
  AVG(gap_usd) as avg_gap_usd,
  MAX(gap_usd) as max_gap_usd,
  MIN(gap_usd) as min_gap_usd,
  SUM(CASE WHEN action_taken = 'entry' THEN 1 ELSE 0 END) as entries,
  SUM(CASE WHEN action_taken = 'exit' THEN 1 ELSE 0 END) as exits,
  SUM(CASE WHEN action_taken = 'none' THEN 1 ELSE 0 END) as missed_opportunities
FROM gaps
GROUP BY DATE_TRUNC('hour', timestamp)
ORDER BY hour DESC;

-- Recent trades summary
CREATE OR REPLACE VIEW recent_trades AS
SELECT 
  trade_id,
  entry_timestamp,
  exit_timestamp,
  entry_gap_usd,
  exit_gap_usd,
  cheap_exchange || ' -> ' || expensive_exchange as trade_direction,
  position_size_btc,
  realized_pnl_usd,
  fees_total,
  (realized_pnl_usd - fees_total) as net_pnl,
  hold_duration_seconds,
  CASE 
    WHEN (realized_pnl_usd - fees_total) > 0 THEN 'WIN'
    ELSE 'LOSS'
  END as result
FROM trades
ORDER BY entry_timestamp DESC
LIMIT 100;

-- ==========================================
-- COMMENTS
-- ==========================================
COMMENT ON TABLE trades IS 'All completed arbitrage trades with P&L data';
COMMENT ON TABLE gaps IS 'Historical record of price gaps and opportunities';
COMMENT ON TABLE performance_metrics IS 'Periodic snapshots of bot performance';
COMMENT ON VIEW daily_performance IS 'Daily aggregated trading performance';
COMMENT ON VIEW hourly_gaps IS 'Hourly gap statistics and action breakdown';
COMMENT ON VIEW recent_trades IS 'Last 100 trades with calculated net P&L';
