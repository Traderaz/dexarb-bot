#!/usr/bin/env node
/**
 * Test market order (which uses aggressive limit IOC internally)
 */

const LighterOrderClient = require('./lighter-order.js');
const config = require('./config.json');

async function test() {
  console.log('Testing Lighter MARKET order (aggressive limit IOC)...\n');
  
  const client = new LighterOrderClient({
    apiKey: config.lighter.apiKey,
    accountIndex: config.lighter.accountIndex,
    apiKeyIndex: config.lighter.apiKeyIndex,
    chainId: config.lighter.chainId,
    baseUrl: config.lighter.restApiUrl
  });
  
  await client.initialize();
  console.log('✅ Client initialized\n');
  
  try {
    console.log('Placing market BUY 0.01 BTC...');
    const result = await client.placeMarketOrder(1, 'buy', 0.01);
    console.log('\n✅ SUCCESS!');
    console.log('TxHash:', result.txHash);
    console.log('\nMarket orders work! The bot should use these instead of limit orders.');
  } catch (error) {
    console.log('\n❌ ERROR:', error.message);
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

test().catch(console.error);

