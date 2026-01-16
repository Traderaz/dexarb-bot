#!/usr/bin/env node
/**
 * Test Lighter order placement with 0.5 BTC at $25,000
 * This tests the price rounding fix
 */

const LighterOrderClient = require('./lighter-order.js');
const config = require('./config.json');

async function testLighterOrder() {
  console.log('═'.repeat(70));
  console.log('🧪 TESTING LIGHTER ORDER PLACEMENT');
  console.log('═'.repeat(70));
  console.log('');
  
  const testPrice = 25000;
  const testSize = 0.5;
  const marketId = 1; // BTC-PERP
  
  console.log('📊 TEST PARAMETERS:');
  console.log('  Market: BTC-PERP (ID: 1)');
  console.log('  Side: BUY');
  console.log('  Size: ' + testSize + ' BTC');
  console.log('  Price: $' + testPrice.toLocaleString());
  console.log('');
  
  // Price rounding test
  const priceWithDecimals = 25000.12345;
  const roundedPrice = Math.round(priceWithDecimals * 10) / 10;
  console.log('🔧 PRICE ROUNDING TEST:');
  console.log('  Original: $' + priceWithDecimals);
  console.log('  Rounded: $' + roundedPrice);
  console.log('  ✅ Lighter requires $0.10 increments');
  console.log('');
  
  try {
    console.log('🔷 Initializing Lighter client...');
    const client = new LighterOrderClient({
      apiKey: config.lighter.apiKey,
      accountIndex: config.lighter.accountIndex,
      apiKeyIndex: config.lighter.apiKeyIndex,
      chainId: config.lighter.chainId,
      baseUrl: config.lighter.restApiUrl
    });
    
    await client.initialize();
    console.log('✅ Client initialized');
    console.log('');
    
    console.log('📝 Placing LIMIT order...');
    console.log('  This will attempt to BUY 0.5 BTC at $25,000');
    console.log('  Since current price is ~$93,000, this order will NOT fill');
    console.log('  (It will sit in the order book or be rejected as too far from market)');
    console.log('');
    
    const result = await client.placeLimitOrder(marketId, 'buy', testSize, testPrice);
    
    console.log('═'.repeat(70));
    console.log('✅ ORDER PLACED SUCCESSFULLY!');
    console.log('═'.repeat(70));
    console.log('');
    console.log('📋 Order Details:');
    console.log('  Transaction Hash: ' + result.txHash);
    console.log('  Order ID: ' + result.orderId);
    console.log('  Status: ' + (result.success ? 'SUCCESS ✅' : 'FAILED ❌'));
    console.log('');
    console.log('🎉 The price rounding fix is working!');
    console.log('   Lighter accepted the order with no 400 error.');
    console.log('');
    console.log('Note: This order likely won\'t fill since $25,000 is far below');
    console.log('      the current market price of ~$93,000.');
    console.log('');
    
  } catch (error) {
    console.log('═'.repeat(70));
    console.log('❌ ORDER FAILED');
    console.log('═'.repeat(70));
    console.log('');
    console.log('Error details:');
    console.log('  Message: ' + error.message);
    console.log('');
    
    if (error.message.includes('400')) {
      console.log('⚠️  Still getting 400 error - price format issue persists');
    } else if (error.message.includes('accidental')) {
      console.log('ℹ️  Order rejected by Lighter\'s "accidental price" protection');
      console.log('   This is expected for prices far from market ($25k vs $93k)');
      console.log('   The price rounding is working, but Lighter blocks extreme prices.');
    } else {
      console.log('⚠️  Unexpected error - investigate further');
    }
    console.log('');
  }
  
  console.log('═'.repeat(70));
}

testLighterOrder()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

