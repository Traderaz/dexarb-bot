/**
 * Lighter REST API Client (No FFI/DLL Required)
 * Works on Windows, Linux, Mac - anywhere Node.js runs
 * Uses simple HTTP requests with API key authentication
 */

const axios = require('axios');
const crypto = require('crypto');

class LighterRestClient {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret || config.apiKey;
    this.accountIndex = config.accountIndex;
    this.baseUrl = config.baseUrl || 'https://api.lighter.xyz';
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.apiKey
      }
    });
  }

  async initialize() {
    console.log('Lighter REST API client initialized');
    return true;
  }

  /**
   * Place a market order (using aggressive limit IOC)
   */
  async placeMarketOrder(symbol, side, size, price) {
    try {
      console.log(`Placing ${side.toUpperCase()} order: ${size} ${symbol} @ $${price}`);

      const orderData = {
        symbol: symbol,
        side: side.toLowerCase(),
        type: 'limit',
        size: size.toString(),
        price: price.toString(),
        time_in_force: 'IOC', // Immediate or cancel (aggressive)
        reduce_only: false,
        post_only: false
      };

      // Sign the request
      const signature = this.signRequest(orderData);
      
      const response = await this.client.post('/v1/orders', orderData, {
        headers: {
          'X-SIGNATURE': signature,
          'X-TIMESTAMP': Date.now().toString()
        }
      });

      console.log('✅ Order placed successfully');
      
      return {
        success: true,
        orderId: response.data.order_id || response.data.id,
        data: response.data
      };

    } catch (error) {
      console.error('❌ Failed to place order:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Sign request with API secret (HMAC-SHA256)
   */
  signRequest(data) {
    const message = JSON.stringify(data);
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(message)
      .digest('hex');
  }

  /**
   * Get orderbook for a market
   */
  async getOrderbook(symbol) {
    try {
      const marketId = this.getMarketId(symbol);
      const response = await this.client.get('/api/v1/orderBookOrders', {
        params: {
          market_id: marketId,
          limit: 10
        }
      });
      return response.data;
    } catch (error) {
      console.error('Failed to get orderbook:', error.message);
      throw error;
    }
  }

  /**
   * Get account positions
   */
  async getPositions() {
    try {
      const response = await this.client.get('/api/v1/account', {
        params: {
          by: 'index',
          value: this.accountIndex
        }
      });
      
      const account = response.data?.accounts?.[0];
      if (!account || !account.positions) {
        return [];
      }
      
      // Filter and return only non-zero positions
      return account.positions
        .filter(pos => Math.abs(parseFloat(pos.position || '0')) > 0.0001)
        .map(pos => ({
          marketId: pos.market_id,
          symbol: pos.symbol,
          side: (pos.sign > 0) ? 'long' : 'short',
          size: Math.abs(parseFloat(pos.position || '0')),
          entryPrice: parseFloat(pos.avg_entry_price || '0'),
          unrealizedPnl: parseFloat(pos.unrealized_pnl || '0'),
          realizedPnl: parseFloat(pos.realized_pnl || '0'),
          margin: parseFloat(pos.allocated_margin || '0')
        }));
    } catch (error) {
      console.error('Failed to get positions:', error.message);
      return [];
    }
  }

  /**
   * Get account information
   */
  async getAccountInfo() {
    try {
      const response = await this.client.get('/api/v1/account', {
        params: {
          by: 'index',
          value: this.accountIndex
        }
      });
      
      const account = response.data?.accounts?.[0];
      if (!account) {
        throw new Error('Account not found');
      }
      
      return {
        accountIndex: account.index,
        address: account.l1_address,
        balance: parseFloat(account.total_asset_value || '0'),
        availableBalance: parseFloat(account.available_balance || '0'),
        collateral: parseFloat(account.collateral || '0'),
        positions: account.positions || [],
        assets: account.assets || []
      };
    } catch (error) {
      console.error('Failed to get account info:', error.message);
      throw error;
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId) {
    try {
      const response = await this.client.delete(`/v1/orders/${orderId}`, {
        headers: {
          'X-API-KEY': this.apiKey
        }
      });
      return response.data;
    } catch (error) {
      console.error('Failed to cancel order:', error.message);
      throw error;
    }
  }

  getMarketId(symbol) {
    const markets = {
      'ETH-PERP': 0,
      'BTC-PERP': 1,
      'SOL-PERP': 2,
      'DOGE-PERP': 3
    };
    return markets[symbol] !== undefined ? markets[symbol] : 1;
  }
}

module.exports = LighterRestClient;

// Test if run directly
if (require.main === module) {
  const config = require('./config.json');
  
  const client = new LighterRestClient({
    apiKey: config.lighter.apiKey,
    apiSecret: config.lighter.apiSecret,
    accountIndex: config.lighter.accountIndex,
    baseUrl: config.lighter.restApiUrl
  });

  client.initialize()
    .then(() => {
      console.log('\n✅ Client ready!');
      console.log('Testing orderbook fetch...');
      return client.getOrderbook('BTC-PERP');
    })
    .then(orderbook => {
      console.log('✅ Orderbook received');
      console.log('Best bid:', orderbook.bids?.[0]);
      console.log('Best ask:', orderbook.asks?.[0]);
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Test failed:', err.message);
      process.exit(1);
    });
}

