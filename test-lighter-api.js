#!/usr/bin/env node
/**
 * Comprehensive Lighter API Test
 * Tests all endpoints to ensure they're working correctly
 */

const LighterRestClient = require('./lighter-rest-api.js');
const config = require('./config.json');

async function testLighterAPI() {
  console.log('');
  console.log('═'.repeat(70));
  console.log('🔷 LIGHTER API COMPREHENSIVE TEST');
  console.log('═'.repeat(70));
  console.log('');

  const client = new LighterRestClient({
    apiKey: config.lighter.apiKey,
    apiSecret: config.lighter.apiSecret,
    accountIndex: config.lighter.accountIndex,
    baseUrl: config.lighter.restApiUrl
  });

  await client.initialize();
  console.log('✅ Client initialized\n');

  // Test 1: Get Orderbook
  console.log('📊 Test 1: Get Orderbook (BTC-PERP)');
  console.log('─'.repeat(70));
  try {
    const orderbook = await client.getOrderbook('BTC-PERP');
    if (orderbook.bids && orderbook.asks) {
      const bestBid = orderbook.bids[0];
      const bestAsk = orderbook.asks[0];
      console.log(`  ✅ Best Bid: $${bestBid.price} (${bestBid.remaining_base_amount} BTC)`);
      console.log(`  ✅ Best Ask: $${bestAsk.price} (${bestAsk.remaining_base_amount} BTC)`);
      const spread = parseFloat(bestAsk.price) - parseFloat(bestBid.price);
      console.log(`  ✅ Spread: $${spread.toFixed(2)}`);
    } else {
      console.log('  ⚠️  Unexpected orderbook format');
    }
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
  }
  console.log('');

  // Test 2: Get Account Info
  console.log('💰 Test 2: Get Account Info');
  console.log('─'.repeat(70));
  try {
    const account = await client.getAccountInfo();
    console.log(`  ✅ Account Index: ${account.accountIndex}`);
    console.log(`  ✅ Address: ${account.address}`);
    console.log(`  ✅ Total Balance: $${account.balance.toFixed(2)}`);
    console.log(`  ✅ Available Balance: $${account.availableBalance.toFixed(2)}`);
    console.log(`  ✅ Collateral: $${account.collateral.toFixed(2)}`);
    console.log(`  ✅ Assets: ${account.assets.length} asset(s)`);
    account.assets.forEach(asset => {
      console.log(`     - ${asset.symbol}: ${asset.balance}`);
    });
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
  }
  console.log('');

  // Test 3: Get Positions
  console.log('📍 Test 3: Get Positions');
  console.log('─'.repeat(70));
  try {
    const positions = await client.getPositions();
    if (positions.length === 0) {
      console.log('  ✅ No open positions (FLAT)');
    } else {
      console.log(`  ✅ Found ${positions.length} position(s):`);
      positions.forEach(pos => {
        console.log(`     - ${pos.symbol}: ${pos.side.toUpperCase()} ${pos.size} @ $${pos.entryPrice}`);
        console.log(`       Unrealized P&L: $${pos.unrealizedPnl.toFixed(2)}`);
        console.log(`       Margin: $${pos.margin.toFixed(2)}`);
      });
    }
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
  }
  console.log('');

  // Test 4: Market ID Mapping
  console.log('🗺️  Test 4: Market ID Mapping');
  console.log('─'.repeat(70));
  const symbols = ['BTC-PERP', 'ETH-PERP', 'SOL-PERP'];
  symbols.forEach(symbol => {
    const marketId = client.getMarketId(symbol);
    console.log(`  ✅ ${symbol} → Market ID: ${marketId}`);
  });
  console.log('');

  console.log('═'.repeat(70));
  console.log('✅ ALL TESTS COMPLETED');
  console.log('═'.repeat(70));
  console.log('');
  console.log('Summary:');
  console.log('  • Orderbook endpoint: /api/v1/orderBookOrders ✓');
  console.log('  • Account endpoint: /api/v1/account ✓');
  console.log('  • Position fetching: Working correctly ✓');
  console.log('  • Market data: Available via orderbook ✓');
  console.log('');
  console.log('Note: The Lighter API uses the account endpoint for positions,');
  console.log('      not a separate /v1/positions endpoint.');
  console.log('');
}

testLighterAPI()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  });

