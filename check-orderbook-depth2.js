#!/usr/bin/env node
/**
 * Check order book depth using the bot's exchange implementations
 */

const { getOrderBookDepth } = require('./api-monitoring-v2.js');

async function main() {
  console.log('');
  console.log('═'.repeat(60));
  console.log('📚 ORDER BOOK DEPTH ANALYSIS');
  console.log('═'.repeat(60));
  console.log('');
  
  try {
    const depth = await getOrderBookDepth();
    
    if (!depth || !depth.lighter || !depth.nado) {
      console.log('❌ Failed to fetch order book data');
      return;
    }
    
    console.log('🔷 LIGHTER Order Book');
    console.log('─'.repeat(60));
    console.log('\n📉 Top 10 Bids (for selling):');
    let lighterBidDepth = 0;
    for (let i = 0; i < Math.min(10, depth.lighter.bids.length); i++) {
      const [price, size] = depth.lighter.bids[i];
      lighterBidDepth += size;
      console.log(`  ${i + 1}. $${price.toFixed(2)} - ${size.toFixed(4)} BTC (${lighterBidDepth.toFixed(4)} cumulative)`);
    }
    
    console.log('\n📈 Top 10 Asks (for buying):');
    let lighterAskDepth = 0;
    for (let i = 0; i < Math.min(10, depth.lighter.asks.length); i++) {
      const [price, size] = depth.lighter.asks[i];
      lighterAskDepth += size;
      console.log(`  ${i + 1}. $${price.toFixed(2)} - ${size.toFixed(4)} BTC (${lighterAskDepth.toFixed(4)} cumulative)`);
    }
    
    console.log('\n📊 Summary:');
    console.log(`  Top 10 Bid Depth: ${lighterBidDepth.toFixed(4)} BTC`);
    console.log(`  Top 10 Ask Depth: ${lighterAskDepth.toFixed(4)} BTC`);
    
    console.log('\n🟣 NADO Order Book');
    console.log('─'.repeat(60));
    console.log('\n📉 Top 10 Bids (for selling/shorting):');
    let nadoBidDepth = 0;
    for (let i = 0; i < Math.min(10, depth.nado.bids.length); i++) {
      const [price, size] = depth.nado.bids[i];
      nadoBidDepth += size;
      console.log(`  ${i + 1}. $${price.toFixed(2)} - ${size.toFixed(4)} BTC (${nadoBidDepth.toFixed(4)} cumulative)`);
    }
    
    console.log('\n📈 Top 10 Asks (for buying/covering shorts):');
    let nadoAskDepth = 0;
    for (let i = 0; i < Math.min(10, depth.nado.asks.length); i++) {
      const [price, size] = depth.nado.asks[i];
      nadoAskDepth += size;
      console.log(`  ${i + 1}. $${price.toFixed(2)} - ${size.toFixed(4)} BTC (${nadoAskDepth.toFixed(4)} cumulative)`);
    }
    
    console.log('\n📊 Summary:');
    console.log(`  Top 10 Bid Depth: ${nadoBidDepth.toFixed(4)} BTC`);
    console.log(`  Top 10 Ask Depth: ${nadoAskDepth.toFixed(4)} BTC`);
    
    // Analysis
    console.log('\n');
    console.log('═'.repeat(60));
    console.log('💡 LIQUIDITY ANALYSIS FOR 1 BTC POSITION');
    console.log('═'.repeat(60));
    
    const positionSize = 1.0;
    
    console.log(`\n📊 For ${positionSize} BTC position:`);
    console.log('\n  Entry (LONG Lighter, SHORT Nado):');
    console.log(`    Lighter buy (ask): ${lighterAskDepth >= positionSize ? '✅ SUFFICIENT' : '⚠️  INSUFFICIENT'} (${lighterAskDepth.toFixed(4)} BTC available)`);
    console.log(`    Nado sell (bid): ${nadoBidDepth >= positionSize ? '✅ SUFFICIENT' : '⚠️  INSUFFICIENT'} (${nadoBidDepth.toFixed(4)} BTC available)`);
    
    console.log('\n  Exit (Sell Lighter, Cover Nado Short):');
    console.log(`    Lighter sell (bid): ${lighterBidDepth >= positionSize ? '✅ SUFFICIENT' : '⚠️  INSUFFICIENT'} (${lighterBidDepth.toFixed(4)} BTC available)`);
    console.log(`    Nado buy (ask): ${nadoAskDepth >= positionSize ? '✅ SUFFICIENT' : '⚠️  INSUFFICIENT'} (${nadoAskDepth.toFixed(4)} BTC available)`);
    
    const minDepth = Math.min(
      lighterAskDepth,
      lighterBidDepth,
      nadoAskDepth,
      nadoBidDepth
    );
    
    console.log(`\n  📌 Recommended max position: ${minDepth.toFixed(4)} BTC`);
    console.log(`  📌 Current config: 0.2 BTC`);
    
    if (minDepth >= 1.0) {
      console.log('\n  ✅ 1 BTC positions should fill without major slippage');
    } else if (minDepth >= 0.5) {
      console.log('\n  ⚠️  0.5-1 BTC possible but may have some slippage');
      console.log(`  💡 Consider ${Math.floor(minDepth * 10) / 10} BTC as max safe size`);
    } else {
      console.log('\n  ⚠️  Limited liquidity - stay at 0.2 BTC or lower');
    }
    
    console.log('\n');
    console.log('═'.repeat(60));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main();

