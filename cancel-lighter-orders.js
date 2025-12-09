/**
 * Cancel all open orders on Lighter
 */

const axios = require('axios');
const config = require('./config.json');

async function cancelAllOrders() {
  try {
    const LighterOrderClient = require('./lighter-order.js');
    const client = new LighterOrderClient({
      apiKey: config.lighter.apiKey,
      accountIndex: config.lighter.accountIndex,
      apiKeyIndex: config.lighter.apiKeyIndex,
      chainId: config.lighter.chainId,
      baseUrl: config.lighter.restApiUrl
    });
    
    await client.initialize();
    console.log('✅ Lighter client initialized');
    
    // Get all open orders
    const ordersResp = await axios.get(`${config.lighter.restApiUrl}/api/v1/orders`, {
      params: {
        account_index: config.lighter.accountIndex,
        api_key_index: config.lighter.apiKeyIndex,
        market_id: 1 // BTC-PERP
      },
      timeout: 10000
    });
    
    console.log('\n📋 Open orders:', JSON.stringify(ordersResp.data, null, 2));
    
    const orders = ordersResp.data.orders || [];
    
    if (orders.length === 0) {
      console.log('\n✅ No open orders to cancel');
      return;
    }
    
    console.log(`\n🚫 Cancelling ${orders.length} open orders...`);
    
    for (const order of orders) {
      try {
        const cancelResp = await axios.post(
          `${config.lighter.restApiUrl}/api/v1/cancelOrder`,
          {
            account_index: config.lighter.accountIndex,
            api_key_index: config.lighter.apiKeyIndex,
            order_id: order.order_id
          },
          { timeout: 10000 }
        );
        console.log(`   ✅ Cancelled order ${order.order_id}`);
      } catch (error) {
        console.log(`   ⚠️  Failed to cancel ${order.order_id}:`, error.message);
      }
    }
    
    console.log('\n✅ All cancellation attempts complete');
    
  } catch (error) {
    console.error('❌ Failed:', error.message);
    console.log('\n⚠️  Please cancel orders manually at: https://app.lighter.xyz/trade/BTC');
  }
}

cancelAllOrders();

