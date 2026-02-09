/**
 * Configuration types for the cross-exchange basis trading bot.
 */

export interface BotConfig {
  // Trading parameters
  entryGapUsd: number;
  exitGapUsd: number;
  positionSizeBtc: number;
  minHoldDurationSeconds: number;
  maxHoldDurationSeconds?: number | null;
  maxNetFundingPerHourThreshold: number;
  entryTimeoutMs: number;
  exitTimeoutMs: number;

  // Exchange configurations
  nado: ExchangeConfig;
  lighter: ExchangeConfig;

  // Fee assumptions
  fees: FeeConfig;

  // Risk parameters
  risk: RiskConfig;

  // Execution mode settings (optional - defaults provided)
  execution?: ExecutionConfig;

  // Operational settings
  dryRun: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  marketDataUpdateIntervalMs: number;
  fundingRateUpdateIntervalMs: number;
}

export interface ExchangeConfig {
  name: string;
  restApiUrl: string;
  wsUrl?: string;
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  testnet: boolean;
  accountIndex?: number; // For Lighter
  apiKeyIndex?: number; // For Lighter
  walletAddress?: string; // For Nado
}

export interface FeeConfig {
  nadoMakerFeeBps: number; // basis points (e.g., 1 = 0.01%)
  nadoTakerFeeBps: number; // basis points (e.g., 3.5 = 0.035%)
  lighterMakerFeeBps: number; // basis points (e.g., 0.2 = 0.002%)
  lighterTakerFeeBps: number; // basis points (e.g., 0.2 = 0.002%)
}

export interface RiskConfig {
  maxLeverage: number;
  minMarginBufferPercent: number;
  maxPartialFillWaitMs: number;
  maxConsecutiveErrors: number;
}

export interface ExecutionConfig {
  // Execution mode for entries and exits (can be different!)
  // "sequential_maker" = Nado maker first, then Lighter on fill (lower fees, slower)
  // "simultaneous" = Both exchanges aggressive limit at same time (faster, slightly higher fees)
  entryMode: 'sequential_maker' | 'simultaneous';
  exitMode: 'sequential_maker' | 'simultaneous';
  
  // For sequential_maker: how conservative to price the Nado maker order
  // Per Nado docs: post-only orders must NOT cross the spread to get maker fees
  // 0 = at best bid/ask (best fill chance while staying maker)
  // positive = ticks DEEPER in book (more conservative, slower fill)
  //   BUY: offset=1 means $1 BELOW best bid
  //   SELL: offset=1 means $1 ABOVE best ask
  nadoMakerOffsetTicks: number;
  
  // Max time to wait for Nado maker to fill before cancelling
  nadoMakerTimeoutMs: number;
  
  // Poll interval for checking Nado fill status
  nadoFillPollIntervalMs: number;
}

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'limit' | 'market';

export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  size: number;
  price?: number;
  reduceOnly?: boolean;
  postOnly?: boolean;
}

export interface Order {
  orderId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  size: number;
  price?: number;
  filledSize: number;
  status: 'open' | 'filled' | 'partially_filled' | 'cancelled' | 'failed';
  timestamp: number;
}

export interface Position {
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number;
  margin: number;
}

export interface OrderBook {
  bids: [number, number][]; // [price, size][]
  asks: [number, number][];
  timestamp: number;
}

export interface FundingRate {
  rate: number; // per 8 hours typically, normalized to per hour
  nextRate?: number;
  timestamp: number;
}

export interface MarketData {
  symbol: string;
  bidPrice: number;
  askPrice: number;
  midPrice: number;
  timestamp: number;
}

