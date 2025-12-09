/**
 * Test Lighter SDK order placement
 * Place a limit order at $85,000 for 0.1 BTC
 */

const LighterOrderClient = require('./lighter-order-sdk.js');
const config = require('./config.json');

async function testOrder() {
  console.log('🧪 Testing Lighter SDK Order Placement\n');
  
  try {
    // Initialize client
    const client = new LighterOrderClient({
      apiKey: config.lighter.apiKey,
      apiSecret: config.lighter.apiSecret,
      accountIndex: config.lighter.accountIndex,
      chainId: config.lighter.chainId || 304,
      baseUrl: config.lighter.restApiUrl
    });

    console.log('Initializing Lighter SDK client...');
    await client.initialize();
    console.log('✅ Client initialized\n');

    // Place limit order
    console.log('Placing LIMIT BUY order:');
    console.log('  Symbol: BTC-PERP');
    console.log('  Side: BUY');
    console.log('  Size: 0.1 BTC');
    console.log('  Price: $85,000\n');

    const result = await client.placeMarketOrder(
      'BTC-PERP',
      'buy',
      0.1,
      85000
    );

    if (result.success) {
      console.log('\n✅ ORDER PLACED SUCCESSFULLY!');
      console.log('Order ID:', result.orderId);
      console.log('TX Hash:', result.txHash);
    } else {
      console.log('\n❌ ORDER FAILED');
      console.log('Error:', result.error);
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

testOrder()
  .then(() => {
    console.log('\n✅ Test complete');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });

