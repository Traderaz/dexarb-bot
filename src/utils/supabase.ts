/**
 * Supabase client initialization
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials in .env file');
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseClient;
}

// Database types
export interface DbTrade {
  id?: string;
  trade_id: string;
  entry_timestamp: string;
  exit_timestamp: string;
  entry_gap_usd: number;
  exit_gap_usd: number;
  cheap_exchange: string;
  expensive_exchange: string;
  position_size_btc: number;
  realized_pnl_btc: number;
  realized_pnl_usd: number;
  hold_duration_seconds: number;
  entry_price_cheap: number;
  entry_price_expensive: number;
  exit_price_long: number;
  exit_price_short: number;
  fees_entry: number;
  fees_exit: number;
  fees_total: number;
  created_at?: string;
}

export interface DbGap {
  id?: string;
  timestamp: string;
  gap_usd: number;
  cheap_exchange: string;
  expensive_exchange: string;
  cheap_price: number;
  expensive_price: number;
  funding_rate_cheap: number;
  funding_rate_expensive: number;
  action_taken: 'entry' | 'exit' | 'none';
  reason?: string;
  created_at?: string;
}

export interface DbPerformanceMetric {
  id?: string;
  timestamp: string;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl_btc: number;
  total_pnl_usd: number;
  total_fees: number;
  net_pnl_usd: number;
  avg_hold_duration_seconds: number;
  avg_pnl_per_trade: number;
  created_at?: string;
}
