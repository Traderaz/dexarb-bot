/**
 * Force close all positions on both Nado and Lighter
 * Uses aggressive market orders to ensure fills
 */

const axios = require('axios');
const config = require('./config.json');

console.log('═══════════════════════════════════════════════════════════');
console.log('🚨 FORCE CLOSE ALL POSITIONS');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('⚠️  IMPORTANT: This will place MARKET orders to close positions');
console.log('⚠️  Make sure you want to do this!\n');

async function closeNadoPosition() {
  try {
    console.log('📊 Closing Nado position (if any)...');
    
    // Get current price
    const priceResp = await axios.get('https://api.nado.xyz/v1/orderbook/BTC-PERP', { timeout: 5000 });
    const bid = parseFloat(priceResp.data.bids[0]?.[0] || 0);
    const ask = parseFloat(priceResp.data.asks[0]?.[0] || 0);
    const midPrice = (bid + ask) / 2;
    
    console.log(`   Current Nado price: $${midPrice.toFixed(2)}`);
    
    // Try to close both LONG and SHORT (one will succeed if position exists)
    const size = 0.01; // Use your position size
    
    // Close potential LONG position (sell to close)
    console.log(`\n   Attempting to close LONG (SELL ${size} BTC)...`);
    try {
      const sellPayload = {
        transactions: [{
          action: 'place_order',
          sender: config.nado.walletAddress,
          subaccount_id: 0,
          side: 2, // SELL
          symbol: 'BTC-PERP',
          order_type: 2, // MARKET
          size: size.toString(),
          reduce_only: true,
          post_only: false
        }]
      };
      
      const sellResp = await axios.post(
        'https://gateway.prod.nado.xyz/v1/execute',
        sellPayload,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        }
      );
      
      console.log('   ✅ SELL order placed:', sellResp.data);
    } catch (error) {
      console.log('   ℹ️  No LONG position to close:', error.response?.data?.message || error.message);
    }
    
    // Close potential SHORT position (buy to close)
    console.log(`\n   Attempting to close SHORT (BUY ${size} BTC)...`);
    try {
      const buyPayload = {
        transactions: [{
          action: 'place_order',
          sender: config.nado.walletAddress,
          subaccount_id: 0,
          side: 1, // BUY
          symbol: 'BTC-PERP',
          order_type: 2, // MARKET
          size: size.toString(),
          reduce_only: true,
          post_only: false
        }]
      };
      
      const buyResp = await axios.post(
        'https://gateway.prod.nado.xyz/v1/execute',
        buyPayload,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        }
      );
      
      console.log('   ✅ BUY order placed:', buyResp.data);
    } catch (error) {
      console.log('   ℹ️  No SHORT position to close:', error.response?.data?.message || error.message);
    }
    
    console.log('\n✅ Nado close orders completed');
    
  } catch (error) {
    console.error('❌ Nado close failed:', error.message);
  }
}

async function closeLighterPosition() {
  try {
    console.log('\n📊 Closing Lighter position (if any)...');
    
    const LighterOrderClient = require('./lighter-order.js');
    const client = new LighterOrderClient({
      apiKey: config.lighter.apiKey,
      accountIndex: config.lighter.accountIndex,
      apiKeyIndex: config.lighter.apiKeyIndex,
      chainId: config.lighter.chainId,
      baseUrl: config.lighter.restApiUrl
    });
    
    await client.initialize();
    console.log('   Lighter client initialized');
    
    const size = 0.01; // Use your position size
    const marketId = 1; // BTC-PERP
    
    // Get current price
    const priceResp = await axios.get(`${config.lighter.restApiUrl}/api/v1/orderBookOrders`, {
      params: { market_id: marketId, limit: 1 },
      timeout: 5000
    });
    const bid = parseFloat(priceResp.data.bids[0]?.price || 0);
    const ask = parseFloat(priceResp.data.asks[0]?.price || 0);
    const midPrice = (bid + ask) / 2;
    
    console.log(`   Current Lighter price: $${midPrice.toFixed(2)}`);
    
    // Close potential LONG position (sell to close)
    console.log(`\n   Attempting to close LONG (SELL ${size} BTC)...`);
    try {
      const sellPrice = bid * 0.99; // Aggressive sell (1% below bid)
      const result = await client.placeLimitOrder(marketId, 'sell', size, sellPrice);
      console.log('   ✅ SELL order placed:', result);
    } catch (error) {
      console.log('   ℹ️  No LONG position to close:', error.message);
    }
    
    // Close potential SHORT position (buy to close)
    console.log(`\n   Attempting to close SHORT (BUY ${size} BTC)...`);
    try {
      const buyPrice = ask * 1.01; // Aggressive buy (1% above ask)
      const result = await client.placeLimitOrder(marketId, 'buy', size, buyPrice);
      console.log('   ✅ BUY order placed:', result);
    } catch (error) {
      console.log('   ℹ️  No SHORT position to close:', error.message);
    }
    
    console.log('\n✅ Lighter close orders completed');
    
  } catch (error) {
    console.error('❌ Lighter close failed:', error.message);
  }
}

async function main() {
  await closeNadoPosition();
  await closeLighterPosition();
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ CLOSE ORDERS SUBMITTED');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\n⚠️  Please verify positions are closed:');
  console.log('   Nado: https://app.nado.xyz/');
  console.log('   Lighter: https://app.lighter.xyz/trade/BTC\n');
}

main().catch(console.error);

