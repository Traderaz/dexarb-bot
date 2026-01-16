/**
 * Close both Nado and Lighter positions
 * Uses proven working methods: lighter-order.js for Lighter, compiled bot code for Nado
 */

const axios = require('axios');
require('dotenv').config();

const LighterOrderClient = require('./lighter-order.js');
const { NadoExchange } = require('./dist/exchanges/nado.js');
const { LighterExchange } = require('./dist/exchanges/lighter.js');
const { createLogger } = require('./dist/utils/logger.js');

async function main() {
  const config = require('./config.json');
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🚨 CLOSING ALL POSITIONS ON BOTH EXCHANGES');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // 1. Get Lighter position
  console.log('📊 Querying Lighter position...');
  const lighterResp = await axios.get(`${config.lighter.restApiUrl}/api/v1/account`, {
    params: {
      by: 'index',
      value: config.lighter.accountIndex
    }
  });
  
  const lighterAccount = lighterResp.data.accounts?.[0];
  const lighterPosition = lighterAccount?.positions?.find(p => p.market_id === 1);
  
  if (lighterPosition && Math.abs(parseFloat(lighterPosition.position)) > 0.0001) {
    const size = parseFloat(lighterPosition.position);
    const side = size > 0 ? 'LONG' : 'SHORT';
    console.log(`   ✅ Found Lighter ${side}: ${Math.abs(size)} BTC @ $${lighterPosition.avg_entry_price}`);
    console.log(`   Unrealized PnL: $${lighterPosition.unrealized_pnl}`);
  } else {
    console.log(`   ✅ No Lighter position`);
  }
  
  // 2. Get Nado position using bot's compiled code
  console.log('\n📊 Querying Nado position...');
  const logger = createLogger('error'); // Use 'error' level to suppress bot logs
  const nadoExchange = new NadoExchange(config.nado, logger, false);
  await nadoExchange.initialize();
  
  const nadoPosition = await nadoExchange.getPosition('BTC-PERP');
  
  if (nadoPosition && Math.abs(nadoPosition.size) > 0.0001) {
    const side = nadoPosition.side === 'long' ? 'LONG' : 'SHORT';
    console.log(`   ✅ Found Nado ${side}: ${Math.abs(nadoPosition.size)} BTC @ $${nadoPosition.entryPrice}`);
  } else {
    console.log(`   ✅ No Nado position`);
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  // 3. Close Lighter position
  if (lighterPosition && Math.abs(parseFloat(lighterPosition.position)) > 0.0001) {
    console.log('🔒 Closing Lighter position...');
    
    const size = parseFloat(lighterPosition.position);
    const isLong = lighterPosition.sign === 1; // Use sign field: 1 = LONG, -1 = SHORT
    const side = isLong ? 'sell' : 'buy';
    const sizeAbs = Math.abs(size);
    
    // Get current price
    const priceResp = await axios.get(`${config.lighter.restApiUrl}/api/v1/orderBookOrders`, {
      params: { market_id: 1, limit: 1 }
    });
    const bid = parseFloat(priceResp.data.bids[0]?.price || 0);
    const ask = parseFloat(priceResp.data.asks[0]?.price || 0);
    const midPrice = (bid + ask) / 2;
    
    // Aggressive price (0.5% through spread for guaranteed fill)
    const aggressiveFactor = side === 'buy' ? 1.005 : 0.995;
    const limitPrice = midPrice * aggressiveFactor;
    
    console.log(`   ${side.toUpperCase()} ${sizeAbs} BTC @ $${limitPrice.toFixed(2)} (market: $${midPrice.toFixed(2)})`);
    
    const lighterClient = new LighterOrderClient({
      apiKey: config.lighter.apiKey,
      accountIndex: config.lighter.accountIndex,
      apiKeyIndex: config.lighter.apiKeyIndex,
      chainId: config.lighter.chainId,
      baseUrl: config.lighter.restApiUrl
    });
    
    await lighterClient.initialize();
    const result = await lighterClient.placeLimitOrder(1, side, sizeAbs, limitPrice);
    
    console.log(`   ✅ Lighter close order placed: ${result.txHash}`);
  }
  
  // 4. Close Nado position using bot's compiled code
  if (nadoPosition && Math.abs(nadoPosition.size) > 0.0001) {
    console.log('\n🔒 Closing Nado position...');
    
    const isLong = nadoPosition.side === 'long';
    const closeSide = isLong ? 'sell' : 'buy';
    const sizeAbs = Math.abs(nadoPosition.size);
    
    // Get current price
    const marketData = await nadoExchange.getMarketData('BTC-PERP');
    const currentPrice = isLong ? marketData.bidPrice : marketData.askPrice;
    
    // Aggressive price (0.5% through spread for guaranteed fill)
    const aggressiveFactor = closeSide === 'buy' ? 1.005 : 0.995;
    const limitPrice = currentPrice * aggressiveFactor;
    
    console.log(`   ${closeSide.toUpperCase()} ${sizeAbs} BTC @ $${limitPrice.toFixed(2)} (market: $${currentPrice.toFixed(2)})`);
    
    const result = await nadoExchange.placeLimitOrder(
      'BTC-PERP',
      closeSide,
      sizeAbs,
      limitPrice,
      { reduceOnly: true, postOnly: false }
    );
    
    console.log(`   ✅ Nado close order placed: ${result.orderId}`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ CLOSE ORDERS PLACED ON BOTH EXCHANGES');
  console.log('='.repeat(60));
  console.log('\n⚠️  Verify closure at:');
  console.log('   Nado: https://app.nado.xyz/');
  console.log('   Lighter: https://app.lighter.xyz/trade/BTC\n');
}

main().catch(error => {
  console.error('\n❌ FAILED:', error.message);
  process.exit(1);
});

