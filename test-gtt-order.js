#!/usr/bin/env node
/**
 * Test Lighter GTT order - should stay on orderbook for 30 seconds
 */

const LighterOrderClient = require('./lighter-order.js');
const config = require('./config.json');

async function test() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🧪 TESTING LIGHTER GTT ORDER - 0.5 BTC @ $55,000');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log('📊 ORDER PARAMETERS:');
  console.log('  Market: BTC-PERP (ID: 1)');
  console.log('  Side: BUY (LONG)');
  console.log('  Size: 0.5 BTC');
  console.log('  Price: $55,000');
  console.log('  TIF: GTT (Good Till Time - 30 seconds)');
  console.log('  Current Price: ~$90,600\n');
  
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
    
    console.log('📝 Placing GTT limit order...');
    console.log('   This order will stay on the orderbook for 30 seconds');
    console.log('   Then auto-expire if not filled\n');
    
    const result = await client.placeLimitOrder(1, 'buy', 0.5, 55000);
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('✅ ORDER PLACED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('TxHash:', result.txHash);
    console.log('\n✅ GTT order is now working!');
    console.log('   - Order will stay on orderbook for 30 seconds');
    console.log('   - Unlike IOC, it won\'t cancel immediately');
    console.log('   - Better fill rates for arbitrage entries/exits\n');
    
    console.log('Check Lighter interface to see the order live on the book!');
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

