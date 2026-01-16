#!/usr/bin/env node
/**
 * Test 0.5 BTC limit order at $55,000
 */

const LighterOrderClient = require('./lighter-order.js');
const config = require('./config.json');

async function test() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🧪 TESTING LIGHTER ORDER - 0.5 BTC @ $55,000');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log('📊 ORDER PARAMETERS:');
  console.log('  Market: BTC-PERP (ID: 1)');
  console.log('  Side: BUY');
  console.log('  Size: 0.5 BTC');
  console.log('  Price: $55,000');
  console.log('  (This will sit in orderbook - current price ~$93k)\n');
  
  const client = new LighterOrderClient({
    apiPrivateKey: config.lighter.apiPrivateKey,
    apiPublicKey: config.lighter.apiPublicKey,
    accountIndex: config.lighter.accountIndex,
    apiKeyIndex: config.lighter.apiKeyIndex,
    chainId: config.lighter.chainId,
    baseUrl: config.lighter.restApiUrl
  });
  
  try {
    console.log('🔷 Initializing Lighter client...');
    await client.initialize();
    console.log('✅ Client initialized\n');
    
    console.log('📝 Placing LIMIT order...');
    const result = await client.placeLimitOrder(1, 'buy', 0.5, 55000);
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('✅ ORDER PLACED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('TxHash:', result.txHash);
    console.log('\n🎉 Lighter orders are now working!');
    console.log('The bot is ready to trade when gaps exceed $100.\n');
  } catch (error) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('❌ ORDER FAILED');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('Error:', error.message);
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

test().catch(console.error);

