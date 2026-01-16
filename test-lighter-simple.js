#!/usr/bin/env node
/**
 * Simple test with full error details
 */

const LighterOrderClient = require('./lighter-order.js');
const config = require('./config.json');
const axios = require('axios');

async function test() {
  console.log('Testing Lighter order with updated DLL...\n');
  
  // Get current price
  const ob = await axios.get(config.lighter.restApiUrl + '/api/v1/orderBookOrders', {
    params: { market_id: 1, limit: 1 }
  });
  const askPrice = parseFloat(ob.data.asks[0].price);
  console.log('Current ask price: $' + askPrice);
  
  // Use a price very close to market (should execute immediately)
  const testPrice = Math.round(askPrice * 1.001); // 0.1% above ask
  const testSize = 0.01; // Small test size
  
  console.log('Test order: BUY ' + testSize + ' BTC @ $' + testPrice);
  console.log('This should execute immediately (IOC at market price)\n');
  
  const client = new LighterOrderClient({
    apiKey: config.lighter.apiKey,
    accountIndex: config.lighter.accountIndex,
    apiKeyIndex: config.lighter.apiKeyIndex,
    chainId: config.lighter.chainId,
    baseUrl: config.lighter.restApiUrl
  });
  
  await client.initialize();
  console.log('Client initialized\n');
  
  try {
    const result = await client.placeLimitOrder(1, 'buy', testSize, testPrice);
    console.log('✅ SUCCESS!');
    console.log('TxHash:', result.txHash);
  } catch (error) {
    console.log('❌ ERROR:', error.message);
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

test().catch(console.error);

