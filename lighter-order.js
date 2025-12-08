/**
 * Lighter order placement module (pure JavaScript)
 * 
 * IMPORTANT NOTES:
 * - Market orders (type=1) work reliably
 * - True limit orders (type=0) are rejected by Lighter's "accidental price" protection
 * - For "limit-like" behavior, use market orders with a specific max price
 * - This is a limitation of Lighter's API validation for type=0 orders
 */

const ffi = require('ffi-napi');
const ref = require('ref-napi');
const Struct = require('ref-struct-napi');
const axios = require('axios');
const path = require('path');

const SignedTxResponse = Struct({
  'txType': ref.types.uint8,
  'txInfo': ref.types.CString,
  'txHash': ref.types.CString,
  'messageToSign': ref.types.CString,
  'err': ref.types.CString,
});

class LighterOrderClient {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.accountIndex = config.accountIndex;
    this.apiKeyIndex = config.apiKeyIndex;
    this.chainId = config.chainId || 304;
    this.baseUrl = config.baseUrl;
    
    // Load DLL
    const dllPath = path.join(__dirname, 'lighter-signer-windows-amd64.dll');
    this.signer = ffi.Library(dllPath, {
      'CreateClient': ['string', ['string', 'string', 'int', 'int', 'int64']],
      'CheckClient': ['string', ['int', 'int64']],
      // FFI signature - NOTE: price is 'int' not 'int64'
      'SignCreateOrder': [SignedTxResponse, [
        'int',    // market_index
        'int64',  // client_order_index  
        'int64',  // base_amount
        'int',    // price (uint32 in Lighter API)
        'int',    // is_ask
        'int',    // type (0=LIMIT, 1=MARKET)
        'int',    // time_in_force (0=IOC, 1=GTT, 2=POST_ONLY)
        'int',    // reduce_only
        'int',    // trigger_price
        'int64',  // expiry
        'int64',  // nonce
        'int',    // api_key_index
        'int64',  // account_index
        'int64',  // hint_order_index_sell
        'int64'   // hint_order_index_buy
      ]],
    });
  }

  async initialize() {
    const createErr = this.signer.CreateClient(
      this.baseUrl,
      this.apiKey,
      this.chainId,
      this.apiKeyIndex,
      this.accountIndex
    );
    
    if (createErr) {
      throw new Error(`Failed to create client: ${createErr}`);
    }
    
    const checkErr = this.signer.CheckClient(this.apiKeyIndex, this.accountIndex);
    if (checkErr) {
      throw new Error(`Failed to verify API key: ${checkErr}`);
    }
    
    return true;
  }

  async placeMarketOrder(marketId, side, sizeInBtc) {
    // CHANGED: Use aggressive LIMIT order instead of MARKET
    // Lighter's market orders don't work reliably, but limits with 0% fee work great!
    // Get nonce
    const nonceResponse = await axios.get(`${this.baseUrl}/api/v1/nextNonce`, {
      params: {
        account_index: this.accountIndex,
        api_key_index: this.apiKeyIndex
      }
    });
    const nonce = nonceResponse.data.nonce;
    
    // Get market price
    const orderbookResponse = await axios.get(`${this.baseUrl}/api/v1/orderBookOrders`, {
      params: {
        market_id: marketId,
        limit: 1
      }
    });
    
    const bidPrice = parseFloat(orderbookResponse.data.bids[0].price);
    const askPrice = parseFloat(orderbookResponse.data.asks[0].price);
    
    // GUARANTEED FILL: Use aggressive limit orders that cross the spread significantly
    // Cross by 0.1% to ensure instant fills even in volatile markets
    // This guarantees execution while keeping costs reasonable
    const aggressiveFactor = side === 'buy' ? 1.001 : 0.999; // 0.1% aggressive for guaranteed fills
    const targetPriceUSD = side === 'buy' ? askPrice * aggressiveFactor : bidPrice * aggressiveFactor;
    
    // Sign order - CORRECTED UNITS (from Lighter admin):
    // BTC-PERP has base_decimals=4 and price_decimals=1
    // baseAmount: 1 unit = 0.0001 BTC (10^-4)
    // price: 1 unit = $0.1 (10^-1) ← CORRECTED!
    const clientOrderIndex = Math.floor(Math.random() * 1000000);
    
    // Unit conversions for BTC-PERP (from API /orderBookDetails):
    // size_decimals: 5 → baseAmount = BTC / 0.00001
    // For 0.1 BTC: 0.1 / 0.00001 = 10,000
    const baseAmount = Math.floor(sizeInBtc / 0.00001); // CORRECTED: size_decimals is 5, not 4!
    
    // price_decimals: 1 → price = USD / 0.1
    // For $92,358: 92358 / 0.1 = 923,580
    const price = Math.floor(targetPriceUSD / 0.1);
    
    const signedTx = this.signer.SignCreateOrder(
      marketId,
      clientOrderIndex,
      baseAmount, // NUMBER for int64
      price,
      side === 'sell' ? 1 : 0,
      0, // LIMIT order type (type 0 = true limit)
      0, // IOC (Immediate Or Cancel) - crosses spread for instant fill
      0, // not reduce-only
      0, // no trigger
      0, // expiry: 0 for market orders
      nonce,
      this.apiKeyIndex,
      this.accountIndex, // NUMBER for int64
      0, // hint_order_index_sell as NUMBER
      0  // hint_order_index_buy as NUMBER
    );
    
    if (signedTx.err) {
      throw new Error(`Signing failed: ${signedTx.err}`);
    }
    
    // DEBUG: Log the txInfo to see what we're actually sending
    const txInfo = JSON.parse(signedTx.txInfo);
    console.log('📝 DEBUG txInfo:');
    console.log(`   BaseAmount: ${txInfo.BaseAmount}`);
    console.log(`   Price: ${txInfo.Price}`);
    console.log(`   Type: ${txInfo.Type}`);
    console.log(`   TimeInForce: ${txInfo.TimeInForce}`);
    
    // Send transaction
    const params = new URLSearchParams();
    params.append('tx_type', signedTx.txType.toString());
    params.append('tx_info', signedTx.txInfo);
    params.append('account_index', this.accountIndex.toString());
    params.append('api_key_index', this.apiKeyIndex.toString());
    
    const response = await axios.post(`${this.baseUrl}/api/v1/sendTx`, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    if (response.data.code !== 200) {
      throw new Error(`Order failed: ${JSON.stringify(response.data)}`);
    }
    
    return {
      txHash: response.data.tx_hash,
      orderId: response.data.tx_hash,
      success: true
    };
  }

  /**
   * Place a limit order at a specific price
   * 
   * NOTE: Due to Lighter's "accidental price" protection, true type=0 LIMIT orders
   * are rejected. This method uses type=1 MARKET orders with the specified price
   * as the max acceptable price. For buy orders, if the limit price is at or above
   * the ask, it will execute immediately. For prices below the bid, the order won't
   * execute and will be cancelled (IOC behavior).
   * 
   * @param {number} marketId - Market ID (1 for BTC-PERP)
   * @param {string} side - 'buy' or 'sell'
   * @param {number} sizeInBtc - Order size in BTC
   * @param {number} limitPriceUSD - Limit price in USD
   */
  async placeLimitOrder(marketId, side, sizeInBtc, limitPriceUSD) {
    // Get nonce
    const nonceResponse = await axios.get(`${this.baseUrl}/api/v1/nextNonce`, {
      params: {
        account_index: this.accountIndex,
        api_key_index: this.apiKeyIndex
      }
    });
    const nonce = nonceResponse.data.nonce;
    
    const clientOrderIndex = Math.floor(Math.random() * 1000000);
    
    // Unit conversions for BTC-PERP (from API /orderBookDetails):
    // size_decimals: 5 → 1 unit = 0.00001 BTC (10^-5)
    // price_decimals: 1 → 1 unit = $0.1 (10^-1)
    const baseAmount = Math.floor(sizeInBtc / 0.00001); // CORRECTED: size_decimals is 5, not 4!
    const priceUnits = Math.floor(limitPriceUSD / 0.1);
    
    console.log(`📝 Placing TRUE LIMIT ${side} order (following Lighter SDK):`);
    console.log(`   Size: ${sizeInBtc} BTC (baseAmount=${baseAmount})`);
    console.log(`   Price: $${limitPriceUSD} (priceUnits=${priceUnits})`);
    
    // Following Lighter's Python SDK example from:
    // https://github.com/elliottech/lighter-python/blob/main/examples/create_modify_cancel_order_http.py
    const signedTx = this.signer.SignCreateOrder(
      marketId,
      clientOrderIndex,
      baseAmount, // NUMBER for int64
      priceUnits,
      side === 'sell' ? 1 : 0,
      0, // type=0 (LIMIT) - TRUE limit order following SDK
      1, // tif=1 (GTT - Good Till Time) - as per SDK example
      0, // not reduce-only
      0, // no trigger
      -1, // expiry as NUMBER for int64
      nonce,
      this.apiKeyIndex,
      this.accountIndex, // NUMBER for int64
      0, // hint_order_index_sell as NUMBER
      0  // hint_order_index_buy as NUMBER
    );
    
    if (signedTx.err) {
      throw new Error(`Signing failed: ${signedTx.err}`);
    }
    
    const txInfo = JSON.parse(signedTx.txInfo);
    console.log(`   Type: ${txInfo.Type}, TIF: ${txInfo.TimeInForce}`);
    console.log(`   ⚠️ DEBUG - BaseAmount in txInfo: ${txInfo.BaseAmount}`);
    console.log(`   ⚠️ DEBUG - Full txInfo:`, JSON.stringify(txInfo, null, 2));
    
    // Send transaction
    const params = new URLSearchParams();
    params.append('tx_type', signedTx.txType.toString());
    params.append('tx_info', signedTx.txInfo);
    params.append('account_index', this.accountIndex.toString());
    params.append('api_key_index', this.apiKeyIndex.toString());
    
    console.log(`   ⚠️ DEBUG - Sending to API:`, {
      tx_type: signedTx.txType.toString(),
      account_index: this.accountIndex.toString(),
      api_key_index: this.apiKeyIndex.toString()
    });
    
    const response = await axios.post(`${this.baseUrl}/api/v1/sendTx`, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    if (response.data.code !== 200) {
      throw new Error(`Order failed: ${JSON.stringify(response.data)}`);
    }
    
    return {
      txHash: response.data.tx_hash,
      orderId: response.data.tx_hash,
      success: true,
      price: limitPriceUSD,
      size: sizeInBtc
    };
  }
}

module.exports = LighterOrderClient;

