/**
 * Lighter order placement using pure TypeScript SDK (no FFI/DLL)
 * Works on both Windows and Linux
 */

const { OrderApi, SignerClient, createWasmSignerClient } = require('@reservoir0x/lighter-ts-sdk');
const { ethers } = require('ethers');

class LighterOrderClient {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret || config.apiKey; // Use same as apiKey if not provided
    this.accountIndex = config.accountIndex;
    this.chainId = config.chainId || 304; // Mantle mainnet
    this.baseUrl = config.baseUrl || 'https://mainnet.zklighter.elliot.ai';
    this.orderApi = null;
    this.signerClient = null;
  }

  async initialize() {
    try {
      // Initialize Order API
      this.orderApi = new OrderApi({
        apiKey: this.apiKey,
        baseUrl: this.baseUrl
      });

      // Initialize Signer Client for signing transactions
      this.signerClient = new SignerClient({
        apiKey: this.apiKey,
        apiSecret: this.apiSecret,
        chainId: this.chainId,
        url: this.baseUrl
      });

      console.log('✅ Lighter SDK client initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize Lighter SDK:', error);
      throw error;
    }
  }

  async placeMarketOrder(marketId, side, size) {
    try {
      if (!this.orderApi || !this.signerClient) {
        throw new Error('Client not initialized. Call initialize() first.');
      }

      // Convert to Lighter format
      const lighterSide = side === 'buy' ? 0 : 1; // 0=buy, 1=sell
      
      // Get current market price for aggressive IOC limit
      const orderbook = await this.getOrderbookByMarketId(marketId);
      const currentPrice = side === 'buy' ? orderbook.asks[0]?.price : orderbook.bids[0]?.price;
      if (!currentPrice) {
        throw new Error('Unable to get current market price');
      }
      
      // Use aggressive price for IOC fill (cross spread by 0.1%)
      const aggressiveFactor = side === 'buy' ? 1.001 : 0.999;
      const targetPriceUSD = currentPrice * aggressiveFactor;

      console.log(`Placing AGGRESSIVE IOC ${side.toUpperCase()} order for ${size} BTC @ ~$${targetPriceUSD.toFixed(2)}`);

      // Place order using SDK
      // IOC (Immediate Or Cancel) = time_in_force: 0
      // This ensures the order fills instantly or gets cancelled, preventing unfilled resting orders
      const orderParams = {
        market_id: marketId,
        order_type: 0, // 0=LIMIT
        side: lighterSide,
        size: Math.floor(size * 1e8).toString(), // Convert to satoshis
        price: Math.floor(targetPriceUSD * 1e10).toString(), // Convert to Lighter units
        time_in_force: 0, // IOC (Immediate Or Cancel) - fills instantly or cancels
        expiry: 0, // Not needed for IOC
        post_only: false
      };

      const result = await this.orderApi.placeOrder(orderParams);

      console.log('✅ Order placed successfully');
      return {
        success: true,
        orderId: result.order_id || Date.now().toString(),
        txHash: result.tx_hash
      };

    } catch (error) {
      console.error('Failed to place order:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  getMarketId(symbol) {
    const markets = {
      'BTC-PERP': 1,
      'ETH-PERP': 0,
      'SOL-PERP': 2,
      'DOGE-PERP': 3
    };
    return markets[symbol] || 1;
  }

  async getOrderbookByMarketId(marketId) {
    try {
      const axios = require('axios');
      const response = await axios.get(`${this.baseUrl}/api/v1/orderBookOrders`, {
        params: { 
          market_id: marketId,
          limit: 1
        }
      });
      
      const data = response.data;
      const bids = data.bids || [];
      const asks = data.asks || [];
      
      return {
        bids: bids.map(b => ({ price: parseFloat(b.price || b[0]) })),
        asks: asks.map(a => ({ price: parseFloat(a.price || a[0]) }))
      };
    } catch (error) {
      console.error('Failed to get orderbook:', error);
      throw error;
    }
  }

  async getOrderbook(symbol) {
    try {
      const marketId = this.getMarketId(symbol);
      return await this.getOrderbookByMarketId(marketId);
    } catch (error) {
      console.error('Failed to get orderbook:', error);
      throw error;
    }
  }
}

module.exports = LighterOrderClient;

// Test if run directly
if (require.main === module) {
  const config = require('./config.json');
  
  const client = new LighterOrderClient({
    apiKey: config.lighter.apiKey,
    apiSecret: config.lighter.apiSecret,
    accountIndex: config.lighter.accountIndex,
    chainId: config.lighter.chainId
  });

  client.initialize()
    .then(() => {
      console.log('Client initialized successfully!');
      process.exit(0);
    })
    .catch(err => {
      console.error('Initialization failed:', err);
      process.exit(1);
    });
}

