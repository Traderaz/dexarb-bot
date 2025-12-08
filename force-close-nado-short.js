/**
 * Force close Nado SHORT position
 * Manually specify the position since query doesn't work
 */

require('dotenv').config();
const { NadoExchange } = require('./dist/exchanges/nado.js');
const { createLogger } = require('./dist/utils/logger.js');
const config = require('./config.json');

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🚨 FORCE CLOSING NADO SHORT POSITION');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Manually specify the position we see in the UI
  const position = {
    side: 'short',
    size: 0.01,  // 0.01000 BTC SHORT
    entryPrice: 90988
  };
  
  console.log('📍 Position to close:');
  console.log(`   ${position.side.toUpperCase()}: ${position.size} BTC`);
  console.log(`   Entry price: $${position.entryPrice}`);
  
  // Initialize Nado
  console.log('\n🔧 Initializing Nado...');
  const logger = createLogger('info');
  const nadoExchange = new NadoExchange(config.nado, logger, false);
  await nadoExchange.initialize();
  
  // To close a SHORT, we need to BUY
  const closeSide = 'buy';
  const size = position.size;
  
  // Get current market data
  console.log('\n📊 Getting current prices...');
  const marketData = await nadoExchange.getMarketData('BTC-PERP');
  
  console.log(`   Current bid: $${marketData.bidPrice.toFixed(2)}`);
  console.log(`   Current ask: $${marketData.askPrice.toFixed(2)}`);
  
  // For closing SHORT: BUY at ASK price + 0.5% to guarantee fill
  const currentPrice = marketData.askPrice;
  const aggressiveFactor = 1.005; // 0.5% above ask
  const limitPrice = Math.round(currentPrice * aggressiveFactor);
  
  console.log(`\n💰 Close order details:`);
  console.log(`   Side: ${closeSide.toUpperCase()} (to close SHORT)`);
  console.log(`   Size: ${size} BTC`);
  console.log(`   Limit price: $${limitPrice.toFixed(2)} (0.5% above ask)`);
  
  // Place close order
  console.log(`\n🔒 Placing BUY order to close SHORT position...`);
  
  const result = await nadoExchange.placeLimitOrder(
    'BTC-PERP',
    closeSide,
    size,
    limitPrice,
    { 
      reduceOnly: true,  // CRITICAL: Only close, don't open new position
      postOnly: false    // Allow crossing spread for immediate fill
    }
  );
  
  console.log('\n✅ Close order placed successfully!');
  console.log('   Order ID:', result.orderId);
  console.log('   Status:', result.status);
  console.log('   Size:', result.size, 'BTC');
  console.log('   Price:', result.price);
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ NADO SHORT CLOSE ORDER SUBMITTED');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\n⚠️  Check your Nado interface to verify the position closed!');
  console.log('   https://app.nado.xyz/\n');
  
  console.log('Expected P&L calculation:');
  console.log(`   Entry: $${position.entryPrice} (SHORT)`);
  console.log(`   Exit: ~$${limitPrice} (BUY to close)`);
  console.log(`   Profit: ~$${((position.entryPrice - limitPrice) * size).toFixed(2)} on ${size} BTC`);
  console.log('');
}

main().catch(error => {
  console.error('\n❌ FAILED:', error.message);
  console.error(error.stack);
  process.exit(1);
});

