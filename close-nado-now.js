/**
 * Close Nado position using bot's proven order placement code
 */

require('dotenv').config();
const { NadoExchange } = require('./dist/exchanges/nado.js');
const { createLogger } = require('./dist/utils/logger.js');
const config = require('./config.json');

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🚨 CLOSING NADO POSITION');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Initialize Nado using bot's code
  const logger = createLogger('info');
  const nadoExchange = new NadoExchange(config.nado, logger, false);
  
  console.log('Initializing Nado...');
  await nadoExchange.initialize();
  
  // Get position
  console.log('\n📊 Checking position...');
  const position = await nadoExchange.getPosition('BTC-PERP');
  
  console.log('Position details:', JSON.stringify(position, null, 2));
  
  if (!position || Math.abs(position.size) < 0.0001) {
    console.log('\n✅ No Nado position to close!');
    console.log('═══════════════════════════════════════════════════════════\n');
    return;
  }
  
  // Determine close side
  const isLong = position.side === 'long';
  const closeSide = isLong ? 'sell' : 'buy';
  const size = Math.abs(position.size);
  
  console.log(`\n📍 Found position: ${position.side.toUpperCase()} ${size} BTC`);
  console.log(`   Entry price: $${position.entryPrice}`);
  console.log(`   Mark price: $${position.markPrice}`);
  console.log(`   Unrealized PnL: $${position.unrealizedPnl}`);
  
  // Get current market data
  console.log('\n📊 Getting current prices...');
  const marketData = await nadoExchange.getMarketData('BTC-PERP');
  const currentPrice = closeSide === 'buy' ? marketData.askPrice : marketData.bidPrice;
  
  // Aggressive pricing for guaranteed fill
  const aggressiveFactor = closeSide === 'buy' ? 1.005 : 0.995;
  const limitPrice = Math.round(currentPrice * aggressiveFactor);
  
  console.log(`   Current ${closeSide === 'buy' ? 'ask' : 'bid'}: $${currentPrice.toFixed(2)}`);
  console.log(`   Limit price: $${limitPrice.toFixed(2)} (0.5% aggressive)`);
  
  // Place close order using bot's exact method
  console.log(`\n🔒 Placing ${closeSide.toUpperCase()} order to close position...`);
  
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
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ NADO CLOSE ORDER SUBMITTED');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\n⚠️  Verify at: https://app.nado.xyz/\n');
}

main().catch(error => {
  console.error('\n❌ FAILED:', error.message);
  console.error(error.stack);
  process.exit(1);
});

