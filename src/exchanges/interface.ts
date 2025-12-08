/**
 * Common exchange interface for Nado and Lighter.
 */

import { 
  Order, 
  Position, 
  OrderBook, 
  FundingRate, 
  MarketData 
} from '../config/types';
import { Logger } from '../utils/logger';

export interface IExchange {
  readonly name: string;
  
  /**
   * Initialize the exchange connection (WebSocket, auth, etc.)
   */
  initialize(): Promise<void>;
  
  /**
   * Get current mark price for the symbol
   */
  getMarkPrice(symbol: string): Promise<number>;
  
  /**
   * Get current market data (bid, ask, mid)
   */
  getMarketData(symbol: string): Promise<MarketData>;
  
  /**
   * Get current funding rate (normalized to per hour)
   */
  getFundingRate(symbol: string): Promise<FundingRate>;
  
  /**
   * Get order book with depth
   */
  getOrderBook(symbol: string, depth?: number): Promise<OrderBook>;
  
  /**
   * Place a limit order
   */
  placeLimitOrder(
    symbol: string,
    side: 'buy' | 'sell',
    size: number,
    price: number,
    options?: { postOnly?: boolean; reduceOnly?: boolean }
  ): Promise<Order>;
  
  /**
   * Place a market order
   */
  placeMarketOrder(
    symbol: string,
    side: 'buy' | 'sell',
    size: number,
    options?: { reduceOnly?: boolean }
  ): Promise<Order>;
  
  /**
   * Cancel an order
   */
  cancelOrder(symbol: string, orderId: string): Promise<void>;
  
  /**
   * Get order status
   */
  getOrder(symbol: string, orderId: string): Promise<Order>;
  
  /**
   * Get all open positions
   */
  getOpenPositions(): Promise<Position[]>;
  
  /**
   * Get specific position
   */
  getPosition(symbol: string): Promise<Position | null>;
  
  /**
   * Get account balance and margin info
   */
  getAccountInfo(): Promise<{
    balance: number;
    availableMargin: number;
    usedMargin: number;
  }>;
  
  /**
   * Subscribe to market data updates via WebSocket
   */
  subscribeToMarketData(
    symbol: string,
    callback: (data: MarketData) => void
  ): Promise<void>;
  
  /**
   * Unsubscribe from market data
   */
  unsubscribeFromMarketData(symbol: string): Promise<void>;
  
  /**
   * Cleanup and close connections
   */
  close(): Promise<void>;
}

export abstract class BaseExchange implements IExchange {
  protected logger: Logger;
  
  constructor(
    public readonly name: string,
    logger: Logger
  ) {
    this.logger = logger;
  }
  
  abstract initialize(): Promise<void>;
  abstract getMarkPrice(symbol: string): Promise<number>;
  abstract getMarketData(symbol: string): Promise<MarketData>;
  abstract getFundingRate(symbol: string): Promise<FundingRate>;
  abstract getOrderBook(symbol: string, depth?: number): Promise<OrderBook>;
  abstract placeLimitOrder(
    symbol: string,
    side: 'buy' | 'sell',
    size: number,
    price: number,
    options?: { postOnly?: boolean; reduceOnly?: boolean }
  ): Promise<Order>;
  abstract placeMarketOrder(
    symbol: string,
    side: 'buy' | 'sell',
    size: number,
    options?: { reduceOnly?: boolean }
  ): Promise<Order>;
  abstract cancelOrder(symbol: string, orderId: string): Promise<void>;
  abstract getOrder(symbol: string, orderId: string): Promise<Order>;
  abstract getOpenPositions(): Promise<Position[]>;
  abstract getPosition(symbol: string): Promise<Position | null>;
  abstract getAccountInfo(): Promise<{
    balance: number;
    availableMargin: number;
    usedMargin: number;
  }>;
  abstract subscribeToMarketData(
    symbol: string,
    callback: (data: MarketData) => void
  ): Promise<void>;
  abstract unsubscribeFromMarketData(symbol: string): Promise<void>;
  abstract close(): Promise<void>;
}

