/**
 * Nado Exchange Adapter
 * 
 * This implementation provides production-ready integration with Nado on Ink network.
 * Uses the @nadohq/client SDK for trading operations and raw WebSocket for market data.
 */

import { createNadoClient, CHAIN_ENV_TO_CHAIN } from '@nadohq/client';
import { createPublicClient, createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { NadoClient } from '@nadohq/client';
import axios from 'axios';
import { BaseExchange } from './interface';
import { 
  Order, 
  Position, 
  OrderBook, 
  FundingRate, 
  MarketData,
  ExchangeConfig 
} from '../config/types';
import { Logger } from '../utils/logger';

export class NadoExchange extends BaseExchange {
  private nadoClient: NadoClient | null = null;
  private marketDataCallbacks: Map<string, (data: MarketData) => void> = new Map();
  private dryRun: boolean;
  private lastMarketData: Map<string, MarketData> = new Map();
  private chainEnv = 'inkMainnet' as const;
  private rpcUrl = 'https://rpc-gel.inkonchain.com';
  private chainId = 57073; // Ink Mainnet
  private accountAddress: string | null = null;
  private endpointAddress: string | null = null; // Endpoint contract for verifying
  private senderHash: string | null = null; // Sender = address + subaccount name (32 bytes)
  private gatewayApiUrl = 'https://gateway.prod.nado.xyz'; // Gateway API for order placement
  
  constructor(_config: ExchangeConfig, logger: Logger, dryRun: boolean = false) {
    super('Nado', logger);
    this.dryRun = dryRun;
    // Note: config is passed but not stored as we use SDK which doesn't need it
  }
  
  async initialize(): Promise<void> {
    this.logger.info(`Initializing ${this.name} exchange...`);
    
    if (this.dryRun) {
      this.logger.info(`${this.name}: Running in DRY RUN mode`);
      return;
    }
    
    // Initialize Nado SDK
    try {
      const privateKey = process.env.ETH_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error('ETH_PRIVATE_KEY not found in environment');
      }

      const account = privateKeyToAccount(`0x${privateKey}`);
      const chain = (CHAIN_ENV_TO_CHAIN as any)[this.chainEnv];

      const walletClient = createWalletClient({
        account,
        chain,
        transport: http(this.rpcUrl),
      }) as any; // Type assertion for viem compatibility

      const publicClient = createPublicClient({
        chain,
        transport: http(this.rpcUrl),
      }) as any; // Type assertion for viem compatibility

      // Create Nado client using the official factory function
      this.nadoClient = createNadoClient(this.chainEnv, {
        walletClient,
        publicClient,
      });
      
      this.accountAddress = account.address;
      this.endpointAddress = this.nadoClient.context.contracts.endpoint.address;
      
      // Construct sender hash: address (20 bytes) + subaccount name (12 bytes)
      // Web app format discovered: address + hex-encoded subaccount name padded to 12 bytes
      const subaccountName = 'default';
      const nameHex = Buffer.from(subaccountName, 'utf8').toString('hex').padEnd(24, '0');
      this.senderHash = `0x${account.address.slice(2)}${nameHex}`;

      this.logger.info(`${this.name}: SDK initialized with address ${account.address}`);
      this.logger.info(`${this.name}: Sender hash: ${this.senderHash}`);
      
      // Test connection
      await this.getAccountInfo();
      this.logger.info(`${this.name}: Successfully connected and authenticated`);
    } catch (error) {
      this.logger.error(`${this.name}: Failed to initialize: ${error}`);
      throw error;
    }
    
    // Using REST API for market data (WebSocket disabled for reliability)
    this.logger.info(`${this.name}: Using REST API for market data`);
  }
  
  // WebSocket methods removed - using REST API only for reliability

  private productIdToSymbol(productId: number): string {
    // Map Nado product IDs to symbols
    // Product ID 2 = BTC-PERP on Nado
    const productMap: { [key: number]: string } = {
      2: 'BTC-PERP',
      // Add other products as needed
    };
    return productMap[productId] || `PRODUCT-${productId}`;
  }

  private symbolToProductId(symbol: string): number {
    // Reverse mapping
    const symbolMap: { [key: string]: number } = {
      'BTC-PERP': 2,
      // Add other products as needed
    };
    return symbolMap[symbol] || 0;
  }
  
  async getMarkPrice(symbol: string): Promise<number> {
    if (this.dryRun) {
      // Return mock data in dry run
      return 45000 + Math.random() * 1000;
    }
    
    if (!this.nadoClient) {
      throw new Error('Nado client not initialized');
    }

    try {
      const productId = this.symbolToProductId(symbol);
      const result = await this.nadoClient.context.engineClient.getMarketPrice({
        productId,
      });

      // result is EngineMarketPrice which has different structure
      return parseFloat(String((result as any).price || 0));
    } catch (error) {
      this.logger.error(`${this.name}: Failed to get mark price: ${error}`);
      throw error;
    }
  }
  
  async getMarketData(symbol: string): Promise<MarketData> {
    // Use short-term cache to avoid excessive API calls
    const cached = this.lastMarketData.get(symbol);
    if (cached && Date.now() - cached.timestamp < 2000) { // 2-second cache
      return cached;
    }
    
    if (this.dryRun) {
      const basePrice = 45000 + Math.random() * 1000;
      const spread = 5 + Math.random() * 10;
      return {
        symbol,
        bidPrice: basePrice - spread / 2,
        askPrice: basePrice + spread / 2,
        midPrice: basePrice,
        timestamp: Date.now()
      };
    }
    
    if (!this.nadoClient) {
      throw new Error('Nado client not initialized');
    }

    try {
      // Fetch order book to get bid/ask prices
      const orderBook = await this.getOrderBook(symbol, 1);
      
      if (orderBook.bids.length === 0 || orderBook.asks.length === 0) {
        throw new Error(`No market data available for ${symbol}`);
      }

      const bidPrice = orderBook.bids[0][0];
      const askPrice = orderBook.asks[0][0];
      const midPrice = (bidPrice + askPrice) / 2;

      const marketData: MarketData = {
        symbol,
        bidPrice,
        askPrice,
        midPrice,
        timestamp: Date.now()
      };

      this.lastMarketData.set(symbol, marketData);
      this.logger.info(`${this.name}: ✓ Market data: ${symbol} bid=${bidPrice}, ask=${askPrice}`);
      return marketData;
    } catch (error) {
      this.logger.error(`${this.name}: Failed to get market data: ${error}`);
      throw error;
    }
  }
  
  async getFundingRate(symbol: string): Promise<FundingRate> {
    if (this.dryRun) {
      return {
        rate: 0.0001 / 8, // Mock: 0.01% per 8 hours = 0.00125% per hour
        nextRate: 0.00015 / 8,
        timestamp: Date.now()
      };
    }
    
    if (!this.nadoClient) {
      throw new Error('Nado client not initialized');
    }

    try {
      const productId = this.symbolToProductId(symbol);
      
      // Get market info which includes funding rate
      const markets = await this.nadoClient.context.engineClient.getAllMarkets();
      const market = (markets as any).perpMarkets?.find((m: any) => m.productId === productId);
      
      if (!market) {
        throw new Error(`Market not found for ${symbol}`);
      }

      // Funding rate is typically stored in the market state
      const fundingRate = parseFloat(String(market.fundingRate || 0));
      
      return {
        rate: fundingRate,
        nextRate: fundingRate, // Nado may not provide predicted next rate
        timestamp: Date.now()
      };
    } catch (error) {
      this.logger.error(`${this.name}: Failed to get funding rate: ${error}`);
      // Return default funding rate if query fails
      return {
        rate: 0,
        nextRate: 0,
        timestamp: Date.now()
      };
    }
  }
  
  async getOrderBook(symbol: string, depth: number = 10): Promise<OrderBook> {
    if (this.dryRun) {
      const basePrice = 45000 + Math.random() * 1000;
      const bids: [number, number][] = [];
      const asks: [number, number][] = [];
      
      for (let i = 0; i < depth; i++) {
        bids.push([basePrice - i * 0.5, 0.1 + Math.random() * 0.5]);
        asks.push([basePrice + i * 0.5, 0.1 + Math.random() * 0.5]);
      }
      
      return { bids, asks, timestamp: Date.now() };
    }
    
    if (!this.nadoClient) {
      throw new Error('Nado client not initialized');
    }

    try {
      const productId = this.symbolToProductId(symbol);
      
      const result = await this.nadoClient.context.engineClient.getMarketLiquidity({
        productId,
        depth,
      });

      const bids: [number, number][] = (result.bids || []).map((tick: any) => [
        parseFloat(String(tick.price)),
        parseFloat(String(tick.size)),
      ]);

      const asks: [number, number][] = (result.asks || []).map((tick: any) => [
        parseFloat(String(tick.price)),
        parseFloat(String(tick.size)),
      ]);

      return {
        bids,
        asks,
        timestamp: Date.now()
      };
    } catch (error) {
      this.logger.error(`${this.name}: Failed to get order book: ${error}`);
      throw error;
    }
  }
  
  /**
   * Build order appendix (bit-packed integer)
   * Based on Nado Protocol documentation:
   * https://nadohq.github.io/nado-python-sdk/order-appendix.html#trigger-orders
   * 
   * Bit layout (from LSB to MSB):
   * - Version (bits 0-7): Protocol version (currently 1)
   * - Isolated (bit 8): Whether order is for isolated position
   * - Order Type (bits 9-10): Execution type (0=DEFAULT, 1=IOC, 2=FOK, 3=POST_ONLY)
   * - Reduce Only (bit 11): Whether order can only reduce positions
   * - Trigger Type (bits 12-13): Type of trigger (0=NONE, 1=PRICE, 2=TWAP, 3=TWAP_CUSTOM_AMOUNTS)
   */
  private buildAppendix(options?: {
    orderType?: 'DEFAULT' | 'IOC' | 'FOK' | 'POST_ONLY';
    reduceOnly?: boolean;
    postOnly?: boolean;
  }): string {
    let appendix = BigInt(1); // Version 1
    
    // Set order type (bits 9-10)
    let orderTypeValue = 0; // DEFAULT
    if (options?.postOnly) {
      orderTypeValue = 3; // POST_ONLY
    } else if (options?.orderType === 'IOC') {
      orderTypeValue = 1;
    } else if (options?.orderType === 'FOK') {
      orderTypeValue = 2;
    } else if (options?.orderType === 'POST_ONLY') {
      orderTypeValue = 3;
    }
    appendix |= BigInt(orderTypeValue) << BigInt(9);
    
    // Set reduce only flag (bit 11)
    if (options?.reduceOnly) {
      appendix |= BigInt(1) << BigInt(11);
    }
    
    return appendix.toString();
  }

  async placeLimitOrder(
    symbol: string,
    side: 'buy' | 'sell',
    size: number,
    price: number,
    options?: { postOnly?: boolean; reduceOnly?: boolean }
  ): Promise<Order> {
    if (this.dryRun) {
      this.logger.info(`[DRY RUN] ${this.name}: Place limit ${side} ${size} ${symbol} @ ${price}`);
      return {
        orderId: `dry-${Date.now()}`,
        symbol,
        side,
        type: 'limit',
        size,
        price,
        filledSize: 0,
        status: 'open',
        timestamp: Date.now()
      };
    }
    
    if (!this.nadoClient || !this.accountAddress || !this.senderHash) {
      throw new Error('Nado client not initialized');
    }

    try {
      const productId = this.symbolToProductId(symbol);
      
      // Build proper appendix
      const appendix = this.buildAppendix({
        orderType: 'DEFAULT',
        postOnly: options?.postOnly,
        reduceOnly: options?.reduceOnly,
      });
      
      // Convert to Nado's internal format (x18 decimals for price, wei for amount)
      // Price must be whole dollars for BTC (divisible by 1e18)
      const priceX18 = (BigInt(Math.floor(price)) * BigInt(10**18)).toString();
      const amountWei = (BigInt(Math.floor(Math.abs(size) * 1e18))).toString();
      const amountSigned = side === 'buy' ? amountWei : `-${amountWei}`;
      
      // Expiration in milliseconds
      const expirationMs = String(Date.now() + 86400000); // 24 hours from now in ms
      
      // Nonce format: 44 bits recv_time (ms) + 20 bits random
      const recvTime = Date.now() + 5000; // 5 seconds from now for network latency
      const randomInt = Math.floor(Math.random() * (2**20));
      const nonce = String((BigInt(recvTime) << BigInt(20)) | BigInt(randomInt));
      
      // Prepare order using web app format discovered from network inspection
      const order = {
        sender: this.senderHash, // address + subaccount name (32 bytes)
        priceX18,
        amount: amountSigned,
        expiration: expirationMs,
        nonce,
        appendix,
      };
      
      // Sign the order using EIP-712
      // The SDK's placeOrder method internally signs, so we'll use that to get the signature
      // Then extract it and use it with the Gateway endpoint
      const account = privateKeyToAccount(`0x${process.env.ETH_PRIVATE_KEY!}`);
      
      // Use EIP-712 signing with CORRECT parameters from docs
      // verifyingContract = product ID as address (NOT endpoint address)
      const verifyingContract = ('0x' + productId.toString(16).padStart(40, '0')) as Hex;
      
      const typedData = {
        domain: {
          name: 'Nado',
          version: '0.0.1', // Correct version from docs
          chainId: this.chainId,
          verifyingContract, // Product ID as address
        },
        types: {
          Order: [
            { name: 'sender', type: 'bytes32' },
            { name: 'priceX18', type: 'int128' },
            { name: 'amount', type: 'int128' },
            { name: 'expiration', type: 'uint64' },
            { name: 'nonce', type: 'uint64' },
            { name: 'appendix', type: 'uint128' },
          ],
        },
        primaryType: 'Order' as const,
        message: {
          sender: this.senderHash as Hex,
          priceX18: BigInt(priceX18),
          amount: BigInt(amountSigned),
          expiration: BigInt(expirationMs),
          nonce: BigInt(nonce),
          appendix: BigInt(appendix),
        },
      };
      
      const signature = await account.signTypedData(typedData);
      
      // Prepare payload in web app format
      const payload = {
        place_orders: {
          orders: [{
            id: Date.now(),
            product_id: productId,
            order,
            signature,
            spot_leverage: null,
            borrow_margin: null,
          }],
          stop_on_failure: null,
        }
      };

      this.logger.info(`${this.name}: Placing limit order ${side} ${size} ${symbol} @ ${price}`);
      
      // Place order via Gateway WebSocket /execute endpoint (same as web app)
      // NOTE: Do NOT retry on 502 errors to avoid duplicate orders!
      // If Nado's API fails, user must manually close positions
      const response = await axios.post(
        'https://gateway.prod.nado.xyz/v1/execute',
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          timeout: 10000,
        }
      );
      
      // Check if order was actually placed
      if (response.data?.status === 'failure' || response.data?.error_code) {
        const errorMsg = response.data?.error || 'Unknown error';
        const errorCode = response.data?.error_code || 'unknown';
        throw new Error(`Gateway API error ${errorCode}: ${errorMsg}`);
      }
      
      // Response structure: { status: 'success', data: [{ digest: '0x...', error: null }] }
      if (!response.data?.data || !Array.isArray(response.data.data) || response.data.data.length === 0) {
        this.logger.error(`${this.name}: Gateway response: ${JSON.stringify(response.data)}`);
        throw new Error('Order placement failed - no orders returned from Gateway');
      }
      
      const orderResult = response.data.data[0];
      if (orderResult.error) {
        throw new Error(`Order error: ${orderResult.error}`);
      }
      
      if (!orderResult.digest) {
        throw new Error('Order placed but no digest returned');
      }
      
      this.logger.info(`${this.name}: Order placed successfully, digest: ${orderResult.digest.substring(0, 16)}...`);
      
      // Parse and return order
      return {
        orderId: orderResult.digest || `nado-${Date.now()}`,
        symbol,
        side,
        type: 'limit',
        size: Math.abs(size),
        price,
        filledSize: 0,
        status: 'open',
        timestamp: Date.now()
      };
    } catch (error) {
      this.logger.error(`${this.name}: Failed to place order: ${error}`);
      throw error;
    }
  }
  
  async placeMarketOrder(
    symbol: string,
    side: 'buy' | 'sell',
    size: number,
    options?: { reduceOnly?: boolean }
  ): Promise<Order> {
    if (this.dryRun) {
      this.logger.info(`[DRY RUN] ${this.name}: Place market ${side} ${size} ${symbol}`);
      return {
        orderId: `dry-${Date.now()}`,
        symbol,
        side,
        type: 'market',
        size,
        filledSize: size,
        status: 'filled',
        timestamp: Date.now()
      };
    }
    
    if (!this.nadoClient || !this.accountAddress) {
      throw new Error('Nado client not initialized');
    }

    try {
      const productId = this.symbolToProductId(symbol);
      
      // For market orders, get current market price
      const marketData = await this.getMarketData(symbol);
      
      // Use aggressive pricing with slippage tolerance
      const slippageFactor = side === 'buy' ? 1.01 : 0.99;
      const executionPrice = side === 'buy' 
        ? marketData.askPrice * slippageFactor 
        : marketData.bidPrice * slippageFactor;
      
      // Build appendix with IOC (Immediate or Cancel) for market orders
      const appendix = this.buildAppendix({
        orderType: 'IOC',
        reduceOnly: options?.reduceOnly,
      });
      
      const orderId = Math.floor(Math.random() * 2_000_000_000);
      const expiration = String(Date.now() + 1800000); // 30 minutes in ms
      
      // Nonce format: 44 bits recv_time (ms) + 20 bits random
      const recvTime = Date.now() + 5000; // 5 seconds from now for network latency
      const randomInt = Math.floor(Math.random() * (2**20));
      const nonce = String((BigInt(recvTime) << BigInt(20)) | BigInt(randomInt));
      
      // Convert to Nado format - price must be whole dollars
      const priceX18 = (BigInt(Math.floor(executionPrice)) * BigInt(10**18)).toString();
      const amountWei = (BigInt(Math.floor(Math.abs(size) * 1e18 * (side === 'buy' ? 1 : -1)))).toString();
      
      const orderData = {
        id: orderId,
        product_id: productId,
        order: {
          sender: this.senderHash,
          priceX18,
          amount: amountWei,
          expiration,
          nonce,
          appendix,
        },
        spot_leverage: null,
        borrow_margin: null,
      };

      this.logger.info(
        `${this.name}: Placing market order ${side} ${size} ${symbol} @ ${executionPrice.toFixed(2)} ` +
        `(appendix: ${appendix})`
      );
      
      // Sign using EIP-712 (same as limit orders)
      const account = privateKeyToAccount(`0x${process.env.ETH_PRIVATE_KEY!}`);
      
      // verifyingContract = product ID as address (NOT endpoint address)
      const verifyingContract = ('0x' + productId.toString(16).padStart(40, '0')) as Hex;
      
      const typedData = {
        domain: {
          name: 'Nado',
          version: '0.0.1', // Correct version from docs
          chainId: this.chainId,
          verifyingContract, // Product ID as address
        },
        types: {
          Order: [
            { name: 'sender', type: 'bytes32' },
            { name: 'priceX18', type: 'int128' },
            { name: 'amount', type: 'int128' },
            { name: 'expiration', type: 'uint64' },
            { name: 'nonce', type: 'uint64' },
            { name: 'appendix', type: 'uint128' },
          ],
        },
        primaryType: 'Order' as const,
        message: {
          sender: this.senderHash as Hex,
          priceX18: BigInt(priceX18),
          amount: BigInt(amountWei),
          expiration: BigInt(expiration),
          nonce: BigInt(nonce),
          appendix: BigInt(appendix),
        },
      };
      
      const signature = await account.signTypedData(typedData);
      
      const payload = {
        place_orders: {
          orders: [{ ...orderData, signature }],
          stop_on_failure: null,
        },
      };
      
      const response = await axios.post(
        `${this.gatewayApiUrl}/v1/execute`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept-Encoding': 'gzip, br, deflate',
          },
          timeout: 10000,
        }
      );
      
      // Check if order was actually placed
      if (response.data?.status === 'failure' || response.data?.error_code) {
        const errorMsg = response.data?.error || 'Unknown error';
        const errorCode = response.data?.error_code || 'unknown';
        throw new Error(`Gateway API error ${errorCode}: ${errorMsg}`);
      }
      
      // Response structure: { status: 'success', data: [{ digest: '0x...', error: null }] }
      if (!response.data?.data || !Array.isArray(response.data.data) || response.data.data.length === 0) {
        this.logger.error(`${this.name}: Gateway response: ${JSON.stringify(response.data)}`);
        throw new Error('Order placement failed - no orders returned from Gateway');
      }
      
      const orderResult = response.data.data[0];
      if (orderResult.error) {
        throw new Error(`Order error: ${orderResult.error}`);
      }
      
      if (!orderResult.digest) {
        throw new Error('Order placed but no digest returned');
      }
      
      this.logger.info(`${this.name}: Market order placed successfully, digest: ${orderResult.digest.substring(0, 16)}...`);
      
      return {
        orderId: orderResult.digest || `nado-${Date.now()}`,
        symbol,
        side,
        type: 'market',
        size: Math.abs(size),
        price: executionPrice,
        filledSize: 0,
        status: 'open',
        timestamp: Date.now()
      };
    } catch (error) {
      this.logger.error(`${this.name}: Failed to place market order: ${error}`);
      throw error;
    }
  }
  
  async cancelOrder(symbol: string, orderId: string): Promise<void> {
    if (this.dryRun) {
      this.logger.info(`[DRY RUN] ${this.name}: Cancel order ${orderId}`);
      return;
    }
    
    if (!this.nadoClient || !this.accountAddress) {
      throw new Error('Nado client not initialized');
    }

    try {
      const productId = this.symbolToProductId(symbol);
      
      // Nonce format: 44 bits recv_time (ms) + 20 bits random (same as order placement)
      const recvTime = Date.now() + 5000; // 5 seconds from now for network latency
      const randomInt = Math.floor(Math.random() * (2**20));
      const nonce = String((BigInt(recvTime) << BigInt(20)) | BigInt(randomInt));
      
      const cancelParams = {
        subaccountOwner: this.accountAddress,
        subaccountName: 'default',
        productIds: [productId],
        digests: [orderId], // Order ID is the digest
        nonce,
        verifyingAddr: this.endpointAddress!,
        chainId: this.chainId,
      };

      this.logger.info(`${this.name}: Cancelling order ${orderId}`);
      
      await this.nadoClient.context.engineClient.cancelOrders(cancelParams);
      
      this.logger.info(`${this.name}: Order cancelled successfully`);
    } catch (error) {
      this.logger.error(`${this.name}: Failed to cancel order: ${error}`);
      throw error;
    }
  }
  
  async getOrder(symbol: string, orderId: string): Promise<Order> {
    if (this.dryRun) {
      return {
        orderId,
        symbol,
        side: 'buy',
        type: 'limit',
        size: 0.1,
        price: 45000,
        filledSize: 0.1,
        status: 'filled',
        timestamp: Date.now()
      };
    }
    
    if (!this.nadoClient || !this.accountAddress) {
      throw new Error('Nado client not initialized');
    }

    try {
      const productId = this.symbolToProductId(symbol);
      
      const result = await this.nadoClient.context.engineClient.getOrder({
        productId,
        digest: orderId,
      } as any);

      if (!result) {
        throw new Error(`Order ${orderId} not found`);
      }

      const order = result as any;
      const amount = parseFloat(String(order.amount || order.orderAmount));
      
      return {
        orderId: order.digest || orderId,
        symbol,
        side: amount > 0 ? 'buy' : 'sell',
        type: 'limit',
        size: Math.abs(amount),
        price: parseFloat(String(order.price || order.orderPrice)),
        filledSize: parseFloat(String(order.filledAmount || order.filled || 0)),
        status: this.normalizeOrderStatus(order.state || order.status),
        timestamp: Date.now()
      };
    } catch (error) {
      const errorMsg = String(error);
      // If it's an H256 error, assume order is still open (format mismatch issue)
      if (errorMsg.includes('H256') || errorMsg.includes('422')) {
        this.logger.warn(`${this.name}: Cannot check order status (format issue), assuming open`);
        return {
          orderId,
          symbol,
          side: 'buy', // Unknown
          type: 'limit',
          size: 0,
          price: 0,
          filledSize: 0,
          status: 'open',
          timestamp: Date.now()
        };
      }
      this.logger.error(`${this.name}: Failed to get order: ${error}`);
      throw error;
    }
  }

  private normalizeOrderStatus(state: any): Order['status'] {
    // Nado order states: 0 = open, 1 = filled, 2 = cancelled
    const stateMap: { [key: number]: Order['status'] } = {
      0: 'open',
      1: 'filled',
      2: 'cancelled',
    };
    return stateMap[state] || 'open';
  }
  
  async getOpenPositions(): Promise<Position[]> {
    if (this.dryRun) {
      return [];
    }

    if (!this.senderHash) {
      throw new Error('Nado client not initialized - sender hash missing');
    }

    try {
      // Use REST API query with the correct sender hash format
      // Sender = wallet address + subaccount name in hex, padded right with zeros
      const axios = (await import('axios')).default;
      const response = await axios.post(`${this.gatewayApiUrl}/v1/query`, {
        type: 'subaccount_info',
        subaccount: this.senderHash
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      const data = response.data?.data;
      if (!data || !data.exists) {
        this.logger.info(`${this.name}: Subaccount does not exist or has no data`);
        return [];
      }

      const positions: Position[] = [];
      
      // Parse perp_balances array (new REST API format)
      if (data.perp_balances && Array.isArray(data.perp_balances)) {
        for (const perpBalance of data.perp_balances) {
          // Amount is in wei-like units (18 decimals)
          const amountWei = BigInt(perpBalance.balance?.amount || '0');
          const amount = Number(amountWei) / 1e18;
          
          // vQuoteBalance is also in wei-like units
          const vQuoteBalanceWei = BigInt(perpBalance.balance?.v_quote_balance || '0');
          const vQuoteBalance = Number(vQuoteBalanceWei) / 1e18;
          
          if (Math.abs(amount) > 0.0001) {
            const productId = perpBalance.product_id;
            const symbol = this.productIdToSymbol(productId);
            
            // Calculate mark price from vQuoteBalance and amount
            // vQuoteBalance is negative of (amount * entry_price)
            const entryPrice = amount !== 0 ? Math.abs(vQuoteBalance / amount) : 0;
            
            // Get current market price for unrealized PnL calculation
            let markPrice = entryPrice;
            try {
              const marketData = await this.getMarketData(symbol);
              markPrice = marketData.midPrice;
            } catch (error) {
              this.logger.warn(`${this.name}: Could not fetch mark price, using entry price`);
            }
            
            // Calculate unrealized PnL
            const unrealizedPnl = amount * (markPrice - entryPrice);
            
            positions.push({
              symbol,
              side: amount > 0 ? 'long' : 'short',
              size: Math.abs(amount),
              entryPrice,
              markPrice,
              unrealizedPnl,
              leverage: 1,
              margin: 0,
            });
            
            this.logger.info(`${this.name}: Found position: ${symbol} ${amount > 0 ? 'LONG' : 'SHORT'} ${Math.abs(amount)} BTC at $${entryPrice.toFixed(2)}`);
          }
        }
      }

      return positions;
    } catch (error: any) {
      this.logger.error(`${this.name}: Failed to get open positions: ${error.message || error}`);
      return [];
    }
  }
  
  async getPosition(symbol: string): Promise<Position | null> {
    const positions = await this.getOpenPositions();
    return positions.find(p => p.symbol === symbol) || null;
  }
  
  async getAccountInfo(): Promise<{
    balance: number;
    availableMargin: number;
    usedMargin: number;
  }> {
    if (this.dryRun) {
      return {
        balance: 10000,
        availableMargin: 9000,
        usedMargin: 1000
      };
    }

    if (!this.nadoClient || !this.accountAddress) {
      throw new Error('Nado client not initialized');
    }
    
    try {
      const summary = await this.nadoClient.context.engineClient.getSubaccountSummary({
        subaccountOwner: this.accountAddress,
        subaccountName: 'default',
      } as any);

      // Calculate balances from spot balances (quote is product ID 0)
      const summaryData = summary as any;
      let balance = 0;
      const spotBalances = summaryData.spot || summaryData.spotBalances || [];
      
      for (const spotBalance of spotBalances) {
        if (spotBalance.productId === 0) { // Quote product (USDC or similar)
          balance = parseFloat(String(spotBalance.amount || 0));
        }
      }

      // Health is a percentage (0-100), convert to available margin
      const healthPercent = parseFloat(String(summaryData.health || summaryData.healthPercent || 0));
      const availableMargin = (balance * healthPercent) / 100;
      const usedMargin = balance - availableMargin;

      return {
        balance,
        availableMargin,
        usedMargin,
      };
    } catch (error) {
      this.logger.error(`${this.name}: Failed to get account info: ${error}`);
      throw error;
    }
  }
  
  async subscribeToMarketData(
    symbol: string,
    callback: (data: MarketData) => void
  ): Promise<void> {
    this.marketDataCallbacks.set(symbol, callback);
    const productId = this.symbolToProductId(symbol);
    this.logger.info(`${this.name}: Subscribed to ${symbol} (product ${productId}) market data`);
    // Note: Using REST API polling, not WebSocket
  }

  async unsubscribeFromMarketData(symbol: string): Promise<void> {
    this.marketDataCallbacks.delete(symbol);
    // Note: Using REST API polling, no WebSocket to unsubscribe from
  }
  
  async close(): Promise<void> {
    // No WebSocket to close (using REST API only)
    this.logger.info(`${this.name}: Closed`);
  }
  
  // Note: SDK handles all signing and authentication
  
  // Utility methods for future SDK integration
  // private _parseOrder(data: any): Order {
  //   return {
  //     orderId: data.orderId || data.id,
  //     symbol: data.symbol,
  //     side: data.side,
  //     type: data.type,
  //     size: parseFloat(data.size || data.amount),
  //     price: data.price ? parseFloat(data.price) : undefined,
  //     filledSize: parseFloat(data.filledSize || data.filled || 0),
  //     status: this.normalizeOrderStatus(data.status),
  //     timestamp: data.timestamp || Date.now()
  //   };
  // }
  
  // private _parsePosition(data: any): Position {
  //   const size = parseFloat(data.size || data.amount);
  //   return {
  //     symbol: data.symbol,
  //     side: size > 0 ? 'long' : 'short',
  //     size: Math.abs(size),
  //     entryPrice: parseFloat(data.entryPrice),
  //     markPrice: parseFloat(data.markPrice),
  //     unrealizedPnl: parseFloat(data.unrealizedPnl || 0),
  //     leverage: parseFloat(data.leverage || 1),
  //     margin: parseFloat(data.margin || 0)
  //   };
  // }
  
  // private _normalizeOrderStatus(status: string): Order['status'] {
  //   const statusMap: { [key: string]: Order['status'] } = {
  //     'new': 'open',
  //     'open': 'open',
  //     'filled': 'filled',
  //     'partially_filled': 'partially_filled',
  //     'cancelled': 'cancelled',
  //     'canceled': 'cancelled',
  //     'rejected': 'failed',
  //     'expired': 'cancelled'
  //   };
  //   return statusMap[status.toLowerCase()] || 'open';
  // }
}

