#!/usr/bin/env node
/**
 * Debug Lighter API order placement
 */

const ffi = require('ffi-napi');
const ref = require('ref-napi');
const Struct = require('ref-struct-napi');
const axios = require('axios');
const path = require('path');
const config = require('./config.json');

const SignedTxResponse = Struct({
  'txType': ref.types.uint8,
  'txInfo': ref.types.CString,
  'txHash': ref.types.CString,
  'messageToSign': ref.types.CString,
  'err': ref.types.CString,
});

async function debugLighterOrder() {
  console.log('═'.repeat(70));
  console.log('🔍 DEBUG LIGHTER ORDER PLACEMENT');
  console.log('═'.repeat(70));
  console.log('');
  
  const baseUrl = config.lighter.restApiUrl;
  const accountIndex = config.lighter.accountIndex;
  const apiKeyIndex = config.lighter.apiKeyIndex;
  const apiKey = config.lighter.apiKey;
  const chainId = config.lighter.chainId;
  
  // Load DLL
  const dllPath = path.join(__dirname, 'lighter-signer-windows-amd64.dll');
  const signer = ffi.Library(dllPath, {
    'CreateClient': ['string', ['string', 'string', 'int', 'int', 'int64']],
    'CheckClient': ['string', ['int', 'int64']],
    'SignCreateOrder': [SignedTxResponse, [
      'int', 'int64', 'int64', 'int', 'int', 'int', 'int', 'int', 'int',
      'int64', 'int64', 'int', 'int64', 'int64', 'int64'
    ]],
  });
  
  // Initialize client
  const createErr = signer.CreateClient(baseUrl, apiKey, chainId, apiKeyIndex, accountIndex);
  if (createErr) {
    console.log('❌ Failed to create client:', createErr);
    return;
  }
  console.log('✅ Client created');
  
  const checkErr = signer.CheckClient(apiKeyIndex, accountIndex);
  if (checkErr) {
    console.log('❌ Failed to verify client:', checkErr);
    return;
  }
  console.log('✅ Client verified');
  console.log('');
  
  // Get current market prices
  console.log('📊 Getting current market prices...');
  const orderbookResponse = await axios.get(`${baseUrl}/api/v1/orderBookOrders`, {
    params: { market_id: 1, limit: 1 }
  });
  
  const bidPrice = parseFloat(orderbookResponse.data.bids[0].price);
  const askPrice = parseFloat(orderbookResponse.data.asks[0].price);
  const midPrice = (bidPrice + askPrice) / 2;
  
  console.log(`   Bid: $${bidPrice}`);
  console.log(`   Ask: $${askPrice}`);
  console.log(`   Mid: $${midPrice.toFixed(2)}`);
  console.log('');
  
  // Get nonce
  const nonceResponse = await axios.get(`${baseUrl}/api/v1/nextNonce`, {
    params: { account_index: accountIndex, api_key_index: apiKeyIndex }
  });
  const nonce = nonceResponse.data.nonce;
  console.log(`📝 Nonce: ${nonce}`);
  console.log('');
  
  // Test different order configurations
  const tests = [
    { name: 'Market Order (IOC)', type: 0, tif: 0, price: Math.round(askPrice * 1.001), size: 0.01 },
    { name: 'Limit Order (GTT)', type: 0, tif: 1, price: Math.round(bidPrice * 0.99), size: 0.01 },
    { name: 'Limit IOC at Ask', type: 0, tif: 0, price: Math.round(askPrice), size: 0.01 },
  ];
  
  for (const test of tests) {
    console.log('─'.repeat(70));
    console.log(`🧪 Test: ${test.name}`);
    console.log(`   Type: ${test.type}, TIF: ${test.tif}`);
    console.log(`   Price: $${test.price} (units: ${test.price * 10})`);
    console.log(`   Size: ${test.size} BTC (units: ${test.size / 0.00001})`);
    console.log('');
    
    const clientOrderIndex = Math.floor(Math.random() * 1000000);
    const baseAmount = Math.round(test.size / 0.00001);
    const priceUnits = Math.round(test.price / 0.1);
    
    try {
      const signedTx = signer.SignCreateOrder(
        1,                    // market_index (BTC-PERP)
        clientOrderIndex,
        baseAmount,
        priceUnits,
        0,                    // is_ask (0 = buy)
        test.type,            // type
        test.tif,             // time_in_force
        0,                    // reduce_only
        0,                    // trigger_price
        0,                    // expiry (0 for IOC, -1 for GTT)
        nonce,
        apiKeyIndex,
        accountIndex,
        0,                    // hint_order_index_sell
        0                     // hint_order_index_buy
      );
      
      if (signedTx.err) {
        console.log(`   ❌ Signing error: ${signedTx.err}`);
        continue;
      }
      
      const txInfo = JSON.parse(signedTx.txInfo);
      console.log(`   ✅ Signed. TxType: ${signedTx.txType}`);
      console.log(`   BaseAmount: ${txInfo.BaseAmount}, Price: ${txInfo.Price}`);
      
      // Send to API
      const params = new URLSearchParams();
      params.append('tx_type', signedTx.txType.toString());
      params.append('tx_info', signedTx.txInfo);
      params.append('account_index', accountIndex.toString());
      params.append('api_key_index', apiKeyIndex.toString());
      
      console.log('   📤 Sending to API...');
      
      const response = await axios.post(`${baseUrl}/api/v1/sendTx`, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      
      console.log(`   ✅ Response code: ${response.data.code}`);
      if (response.data.code === 200) {
        console.log(`   ✅ SUCCESS! tx_hash: ${response.data.tx_hash}`);
      } else {
        console.log(`   ❌ Error: ${JSON.stringify(response.data)}`);
      }
      
    } catch (error) {
      console.log(`   ❌ API Error: ${error.response?.status} - ${JSON.stringify(error.response?.data || error.message)}`);
    }
    
    console.log('');
    // Wait a bit between tests
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('═'.repeat(70));
}

debugLighterOrder().catch(console.error);

