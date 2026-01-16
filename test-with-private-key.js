#!/usr/bin/env node
/**
 * Test Lighter order with private key
 */

const LighterOrderClient = require('./lighter-order.js');
const config = require('./config.json');
const axios = require('axios');

async function test() {
  console.log('Testing Lighter with API Private Key...\n');
  console.log('API Key Index:', config.lighter.apiKeyIndex);
  console.log('Account Index:', config.lighter.accountIndex);
  console.log('Private Key:', config.lighter.apiPrivateKey.substring(0, 20) + '...');
  console.log('');
  
  // Get current price
  const ob = await axios.get(config.lighter.restApiUrl + '/api/v1/orderBookOrders', {
    params: { market_id: 1, limit: 1 }
  });
  const askPrice = parseFloat(ob.data.asks[0].price);
  console.log('Current ask price: $' + askPrice);
  
  const testPrice = Math.round(askPrice * 1.001);
  const testSize = 0.01;
  
  console.log('Test order: BUY ' + testSize + ' BTC @ $' + testPrice);
  console.log('');
  
  const client = new LighterOrderClient({
    apiKey: config.lighter.apiKey,
    apiPrivateKey: config.lighter.apiPrivateKey,
    accountIndex: config.lighter.accountIndex,
    apiKeyIndex: config.lighter.apiKeyIndex,
    chainId: config.lighter.chainId,
    baseUrl: config.lighter.restApiUrl
  });
  
  try {
    console.log('Initializing client with private key...');
    await client.initialize();
    console.log('✅ Client initialized\n');
    
    console.log('Placing order...');
    const result = await client.placeLimitOrder(1, 'buy', testSize, testPrice);
    console.log('\n✅ SUCCESS!');
    console.log('TxHash:', result.txHash);
    console.log('\n🎉 Orders are working with private key!');
  } catch (error) {
    console.log('\n❌ ERROR:', error.message);
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

test().catch(console.error);

