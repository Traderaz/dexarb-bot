/**
 * Test Lighter order placement using FFI (DLL-based signer)
 */

const LighterOrderClient = require('./lighter-order.js');
const config = require('./config.json');

async function testOrder() {
  console.log('Testing Lighter order placement (FFI-based)...\n');
  
  try {
    // Initialize client
    const client = new LighterOrderClient({
      apiKey: config.lighter.apiKey,
      accountIndex: config.lighter.accountIndex,
      apiKeyIndex: config.lighter.apiKeyIndex,
      chainId: config.lighter.chainId || 304,
      baseUrl: config.lighter.restApiUrl
    });

    console.log('Initializing Lighter client...');
    await client.initialize();
    console.log('✅ Client initialized\n');

    // Place LIMIT BUY order at $85,000 for 0.1 BTC
    console.log('Placing LIMIT BUY ORDER:');
    console.log('  Market: BTC-PERP (ID: 1)');
    console.log('  Side: BUY');
    console.log('  Size: 0.1 BTC');
    console.log('  Price: $85,000');
    console.log('  Type: POST_ONLY (maker fee)\n');

    const result = await client.placeLimitOrder(
      1,        // market_id: 1 = BTC-PERP
      'buy',    // side
      0.1,      // size in BTC
      85000,    // price in USD
      true      // postOnly
    );

    if (result.success) {
      console.log('✅ ORDER PLACED SUCCESSFULLY!\n');
      console.log('Order Details:');
      console.log('  TX Hash:', result.txHash);
      console.log('  Order ID:', result.orderId);
    } else {
      console.log('❌ ORDER FAILED\n');
      console.log('Error:', result.error);
    }

  } catch (error) {
    console.error('❌ Failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

testOrder();

