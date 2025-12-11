#!/usr/bin/env node
/**
 * Check order book depth on both exchanges
 */

const axios = require('axios');
const config = require('./config.json');

async function checkNadoOrderBook() {
  console.log('🟣 NADO Order Book Depth');
  console.log('─'.repeat(60));
  
  try {
    const response = await axios.get('https://gateway.prod.nado.xyz/v1/orderbook', {
      params: {
        product_id: 2  // BTC-PERP
      }
    });
    
    const orderbook = response.data;
    
    // Calculate depth for bids (we sell into bids)
    let bidDepth = 0;
    let bidVolume = 0;
    console.log('\n📉 Bids (for selling/shorting):');
    for (let i = 0; i < Math.min(10, orderbook.bids.length); i++) {
      const [price, size] = orderbook.bids[i];
      bidDepth += parseFloat(size);
      const sizeNum = parseFloat(size);
      const priceNum = parseFloat(price);
      bidVolume += (sizeNum * priceNum);
      console.log(`  ${i + 1}. $${priceNum.toFixed(2)} - ${sizeNum.toFixed(4)} BTC (${bidDepth.toFixed(4)} cumulative)`);
    }
    
    // Calculate depth for asks (we buy from asks)
    let askDepth = 0;
    let askVolume = 0;
    console.log('\n📈 Asks (for buying/covering shorts):');
    for (let i = 0; i < Math.min(10, orderbook.asks.length); i++) {
      const [price, size] = orderbook.asks[i];
      askDepth += parseFloat(size);
      const sizeNum = parseFloat(size);
      const priceNum = parseFloat(price);
      askVolume += (sizeNum * priceNum);
      console.log(`  ${i + 1}. $${priceNum.toFixed(2)} - ${sizeNum.toFixed(4)} BTC (${askDepth.toFixed(4)} cumulative)`);
    }
    
    console.log('\n📊 Summary:');
    console.log(`  Top 10 Bid Depth: ${bidDepth.toFixed(4)} BTC ($${bidVolume.toFixed(2)})`);
    console.log(`  Top 10 Ask Depth: ${askDepth.toFixed(4)} BTC ($${askVolume.toFixed(2)})`);
    console.log(`  Spread: $${(parseFloat(orderbook.asks[0][0]) - parseFloat(orderbook.bids[0][0])).toFixed(2)}`);
    
    return { bidDepth, askDepth };
  } catch (error) {
    console.error('Error fetching Nado orderbook:', error.message);
    return null;
  }
}

async function checkLighterOrderBook() {
  console.log('\n🔷 LIGHTER Order Book Depth');
  console.log('─'.repeat(60));
  
  try {
    const response = await axios.get('https://mainnet.zklighter.elliot.ai/orderbook', {
      params: {
        symbol: 'BTC-PERP',
        depth: 20
      }
    });
    
    const orderbook = response.data;
    
    // Calculate depth for bids
    let bidDepth = 0;
    let bidVolume = 0;
    console.log('\n📉 Bids (for selling):');
    for (let i = 0; i < Math.min(10, orderbook.bids.length); i++) {
      const [priceStr, sizeStr] = orderbook.bids[i];
      const price = parseFloat(priceStr);
      const size = parseFloat(sizeStr);
      bidDepth += size;
      bidVolume += (size * price);
      console.log(`  ${i + 1}. $${price.toFixed(2)} - ${size.toFixed(4)} BTC (${bidDepth.toFixed(4)} cumulative)`);
    }
    
    // Calculate depth for asks
    let askDepth = 0;
    let askVolume = 0;
    console.log('\n📈 Asks (for buying):');
    for (let i = 0; i < Math.min(10, orderbook.asks.length); i++) {
      const [priceStr, sizeStr] = orderbook.asks[i];
      const price = parseFloat(priceStr);
      const size = parseFloat(sizeStr);
      askDepth += size;
      askVolume += (size * price);
      console.log(`  ${i + 1}. $${price.toFixed(2)} - ${size.toFixed(4)} BTC (${askDepth.toFixed(4)} cumulative)`);
    }
    
    console.log('\n📊 Summary:');
    console.log(`  Top 10 Bid Depth: ${bidDepth.toFixed(4)} BTC ($${bidVolume.toFixed(2)})`);
    console.log(`  Top 10 Ask Depth: ${askDepth.toFixed(4)} BTC ($${askVolume.toFixed(2)})`);
    console.log(`  Spread: $${(parseFloat(orderbook.asks[0][0]) - parseFloat(orderbook.bids[0][0])).toFixed(2)}`);
    
    return { bidDepth, askDepth };
  } catch (error) {
    console.error('Error fetching Lighter orderbook:', error.message);
    return null;
  }
}

async function main() {
  console.log('');
  console.log('═'.repeat(60));
  console.log('📚 ORDER BOOK DEPTH ANALYSIS');
  console.log('═'.repeat(60));
  console.log('');
  
  const nadoDepth = await checkNadoOrderBook();
  const lighterDepth = await checkLighterOrderBook();
  
  if (nadoDepth && lighterDepth) {
    console.log('\n');
    console.log('═'.repeat(60));
    console.log('💡 LIQUIDITY ANALYSIS FOR 1 BTC POSITION');
    console.log('═'.repeat(60));
    
    const positionSize = 1.0;
    
    console.log(`\n📊 For ${positionSize} BTC position:`);
    console.log('\n  Entry (LONG Lighter, SHORT Nado):');
    console.log(`    Lighter buy (ask): ${lighterDepth.askDepth >= positionSize ? '✅ SUFFICIENT' : '⚠️  INSUFFICIENT'} (${lighterDepth.askDepth.toFixed(4)} BTC available)`);
    console.log(`    Nado sell (bid): ${nadoDepth.bidDepth >= positionSize ? '✅ SUFFICIENT' : '⚠️  INSUFFICIENT'} (${nadoDepth.bidDepth.toFixed(4)} BTC available)`);
    
    console.log('\n  Exit (Sell Lighter, Cover Nado Short):');
    console.log(`    Lighter sell (bid): ${lighterDepth.bidDepth >= positionSize ? '✅ SUFFICIENT' : '⚠️  INSUFFICIENT'} (${lighterDepth.bidDepth.toFixed(4)} BTC available)`);
    console.log(`    Nado buy (ask): ${nadoDepth.askDepth >= positionSize ? '✅ SUFFICIENT' : '⚠️  INSUFFICIENT'} (${nadoDepth.askDepth.toFixed(4)} BTC available)`);
    
    const minDepth = Math.min(
      lighterDepth.askDepth,
      lighterDepth.bidDepth,
      nadoDepth.askDepth,
      nadoDepth.bidDepth
    );
    
    console.log(`\n  📌 Recommended max position: ${minDepth.toFixed(4)} BTC`);
    console.log(`  📌 Current config: ${config.positionSizeBtc} BTC`);
    
    if (minDepth >= 1.0) {
      console.log('\n  ✅ 1 BTC positions should fill without major slippage');
    } else {
      console.log('\n  ⚠️  1 BTC might experience slippage - consider staying at lower size');
    }
  }
  
  console.log('\n');
  console.log('═'.repeat(60));
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});

