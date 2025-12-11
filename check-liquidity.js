#!/usr/bin/env node
/**
 * Check order book liquidity for both exchanges
 */

require('dotenv').config();
const config = require('./config.json');
const { NadoExchange } = require('./dist/exchanges/nado.js');
const { LighterExchange } = require('./dist/exchanges/lighter.js');
const { createLogger } = require('./dist/utils/logger.js');

async function main() {
  console.log('');
  console.log('═'.repeat(60));
  console.log('📚 ORDER BOOK DEPTH ANALYSIS');
  console.log('═'.repeat(60));
  console.log('');

  const logger = createLogger('error'); // Only show errors
  
  // Initialize exchanges
  console.log('⏳ Initializing exchanges...\n');
  
  const nadoExchange = new NadoExchange(config.nado, logger, false);
  await nadoExchange.initialize();
  
  const lighterExchange = new LighterExchange(config.lighter, logger, false);
  await lighterExchange.initialize();
  
  // Get order books (20 levels deep)
  console.log('📖 Fetching order books...\n');
  
  const lighterOrderBook = await lighterExchange.getOrderBook('BTC-PERP', 20);
  const nadoOrderBook = await nadoExchange.getOrderBook('BTC-PERP', 20);
  
  // Analyze Lighter
  console.log('🔷 LIGHTER Order Book');
  console.log('─'.repeat(60));
  console.log('\n📉 Top 10 Bids (for selling):');
  let lighterBidDepth = 0;
  for (let i = 0; i < Math.min(10, lighterOrderBook.bids.length); i++) {
    const [price, size] = lighterOrderBook.bids[i];
    lighterBidDepth += size;
    console.log(`  ${i + 1}. $${price.toFixed(2)} - ${size.toFixed(4)} BTC (${lighterBidDepth.toFixed(4)} cumulative)`);
  }
  
  console.log('\n📈 Top 10 Asks (for buying):');
  let lighterAskDepth = 0;
  for (let i = 0; i < Math.min(10, lighterOrderBook.asks.length); i++) {
    const [price, size] = lighterOrderBook.asks[i];
    lighterAskDepth += size;
    console.log(`  ${i + 1}. $${price.toFixed(2)} - ${size.toFixed(4)} BTC (${lighterAskDepth.toFixed(4)} cumulative)`);
  }
  
  console.log('\n📊 Summary:');
  console.log(`  Top 10 Bid Depth: ${lighterBidDepth.toFixed(4)} BTC`);
  console.log(`  Top 10 Ask Depth: ${lighterAskDepth.toFixed(4)} BTC`);
  const lighterSpread = lighterOrderBook.asks[0][0] - lighterOrderBook.bids[0][0];
  console.log(`  Spread: $${lighterSpread.toFixed(2)}`);
  
  // Analyze Nado
  console.log('\n🟣 NADO Order Book');
  console.log('─'.repeat(60));
  console.log('\n📉 Top 10 Bids (for selling/shorting):');
  let nadoBidDepth = 0;
  for (let i = 0; i < Math.min(10, nadoOrderBook.bids.length); i++) {
    const [price, size] = nadoOrderBook.bids[i];
    nadoBidDepth += size;
    console.log(`  ${i + 1}. $${price.toFixed(2)} - ${size.toFixed(4)} BTC (${nadoBidDepth.toFixed(4)} cumulative)`);
  }
  
  console.log('\n📈 Top 10 Asks (for buying/covering shorts):');
  let nadoAskDepth = 0;
  for (let i = 0; i < Math.min(10, nadoOrderBook.asks.length); i++) {
    const [price, size] = nadoOrderBook.asks[i];
    nadoAskDepth += size;
    console.log(`  ${i + 1}. $${price.toFixed(2)} - ${size.toFixed(4)} BTC (${nadoAskDepth.toFixed(4)} cumulative)`);
  }
  
  console.log('\n📊 Summary:');
  console.log(`  Top 10 Bid Depth: ${nadoBidDepth.toFixed(4)} BTC`);
  console.log(`  Top 10 Ask Depth: ${nadoAskDepth.toFixed(4)} BTC`);
  const nadoSpread = nadoOrderBook.asks[0][0] - nadoOrderBook.bids[0][0];
  console.log(`  Spread: $${nadoSpread.toFixed(2)}`);
  
  // Overall analysis
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('💡 LIQUIDITY ANALYSIS FOR DIFFERENT POSITION SIZES');
  console.log('═'.repeat(60));
  
  const sizes = [0.2, 0.5, 1.0];
  
  for (const positionSize of sizes) {
    console.log(`\n📊 For ${positionSize} BTC position:`);
    console.log('\n  Entry (LONG Lighter, SHORT Nado):');
    console.log(`    Lighter buy (ask): ${lighterAskDepth >= positionSize ? '✅' : '⚠️'} ${lighterAskDepth.toFixed(4)} BTC available`);
    console.log(`    Nado sell (bid):   ${nadoBidDepth >= positionSize ? '✅' : '⚠️'} ${nadoBidDepth.toFixed(4)} BTC available`);
    
    console.log('\n  Exit (Sell Lighter, Cover Nado Short):');
    console.log(`    Lighter sell (bid): ${lighterBidDepth >= positionSize ? '✅' : '⚠️'} ${lighterBidDepth.toFixed(4)} BTC available`);
    console.log(`    Nado buy (ask):     ${nadoAskDepth >= positionSize ? '✅' : '⚠️'} ${nadoAskDepth.toFixed(4)} BTC available`);
    
    const minDepth = Math.min(
      lighterAskDepth,
      lighterBidDepth,
      nadoAskDepth,
      nadoBidDepth
    );
    
    if (minDepth >= positionSize) {
      console.log(`\n  ✅ ${positionSize} BTC should fill with minimal slippage`);
    } else {
      console.log(`\n  ⚠️  ${positionSize} BTC may experience slippage (only ${minDepth.toFixed(4)} BTC available)`);
    }
  }
  
  const overallMinDepth = Math.min(
    lighterAskDepth,
    lighterBidDepth,
    nadoAskDepth,
    nadoBidDepth
  );
  
  console.log(`\n\n📌 Recommended max position size: ${overallMinDepth.toFixed(4)} BTC`);
  console.log(`📌 Current config: ${config.positionSizeBtc} BTC`);
  
  if (overallMinDepth >= 1.0) {
    console.log('\n✅ CONCLUSION: 1 BTC positions should fill without major slippage');
  } else if (overallMinDepth >= 0.5) {
    console.log(`\n⚠️  CONCLUSION: Consider max ${Math.floor(overallMinDepth * 10) / 10} BTC to avoid slippage`);
  } else {
    console.log('\n⚠️  CONCLUSION: Limited liquidity - stay at current size or lower');
  }
  
  console.log('\n');
  console.log('═'.repeat(60));
  
  // Cleanup
  await nadoExchange.disconnect();
  await lighterExchange.disconnect();
  
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});

