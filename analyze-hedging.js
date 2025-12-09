/**
 * Analyze if trades were properly hedged by comparing Nado and Lighter trade history
 */

const axios = require('axios');
const config = require('./config.json');

async function getLighterTrades() {
  try {
    // Get account data from Lighter which includes recent trades
    const response = await axios.get(`${config.lighter.restApiUrl}/api/v1/account`, {
      params: {
        by: 'index',
        value: config.lighter.accountIndex
      },
      timeout: 10000
    });
    
    // Extract trades from account data
    const account = response.data.accounts?.[0];
    if (!account) return [];
    
    // Also try to get fills from orders endpoint
    let trades = [];
    
    try {
      const ordersResp = await axios.get(`${config.lighter.restApiUrl}/api/v1/orders`, {
        params: {
          account_index: config.lighter.accountIndex,
          market_id: 1,
          limit: 50
        },
        timeout: 10000
      });
      
      // Extract filled orders
      trades = ordersResp.data.orders?.filter(o => o.status === 'FILLED' || o.filled_amount > 0) || [];
    } catch (e) {
      console.log('Note: Could not fetch order history, checking account data only');
    }
    
    return trades;
  } catch (error) {
    console.error('Failed to get Lighter trades:', error.message);
    return [];
  }
}

async function getNadoTrades() {
  try {
    // Try REST API endpoint for orders/fills
    const response = await axios.get(
      `https://gateway.prod.nado.xyz/v1/orders`,
      {
        headers: {
          'X-API-Key': config.nado.apiKey
        },
        params: {
          address: config.nado.walletAddress,
          market: 'BTC-PERP',
          limit: 50
        },
        timeout: 10000
      }
    );
    
    // Extract filled orders
    const orders = response.data?.orders || response.data || [];
    return orders.filter(o => o.status === 'FILLED' || o.filled_size > 0);
  } catch (error) {
    console.error('Failed to get Nado trades:', error.message);
    console.error('Error details:', error.response?.data || error.message);
    return [];
  }
}

async function analyzeHedging() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 ANALYZING TRADE HEDGING');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  console.log('Fetching trade history from both exchanges...\n');
  
  const [lighterTrades, nadoTrades] = await Promise.all([
    getLighterTrades(),
    getNadoTrades()
  ]);
  
  console.log(`✅ Lighter: Found ${lighterTrades.length} trades`);
  console.log(`✅ Nado: Found ${nadoTrades.length} trades\n`);
  
  if (lighterTrades.length === 0 && nadoTrades.length === 0) {
    console.log('❌ No trades found on either exchange\n');
    return;
  }
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('LIGHTER TRADES (Most Recent):');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  lighterTrades.slice(0, 20).forEach(trade => {
    const time = new Date(trade.timestamp || trade.time * 1000).toLocaleString();
    const side = trade.is_buy || trade.side === 'buy' ? 'BUY' : 'SELL';
    const size = parseFloat(trade.size || trade.base_amount || 0);
    const price = parseFloat(trade.price || 0);
    console.log(`${time} | ${side.padEnd(4)} | ${size.toFixed(5)} BTC @ $${price.toFixed(2)}`);
  });
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('NADO TRADES (Most Recent):');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  nadoTrades.slice(0, 20).forEach(trade => {
    const time = new Date(parseInt(trade.timestamp)).toLocaleString();
    const side = trade.side.toUpperCase();
    const size = parseFloat(trade.size);
    const price = parseFloat(trade.price);
    console.log(`${time} | ${side.padEnd(4)} | ${size.toFixed(5)} BTC @ $${price.toFixed(2)}`);
  });
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('HEDGING ANALYSIS:');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Look for trades within 5 minutes of each other with opposite sides
  let hedgedCount = 0;
  let unhedgedCount = 0;
  
  lighterTrades.forEach(lTrade => {
    const lTime = new Date(lTrade.timestamp || lTrade.time * 1000).getTime();
    const lSide = lTrade.is_buy || lTrade.side === 'buy' ? 'BUY' : 'SELL';
    const lSize = parseFloat(lTrade.size || lTrade.base_amount || 0);
    
    // Look for matching Nado trade (opposite side, similar time)
    const matchingNado = nadoTrades.find(nTrade => {
      const nTime = parseInt(nTrade.timestamp);
      const nSide = nTrade.side.toUpperCase();
      const nSize = parseFloat(nTrade.size);
      const timeDiff = Math.abs(lTime - nTime) / 1000; // seconds
      
      // Should be opposite sides and similar size within 60 seconds
      return (
        (lSide === 'BUY' && nSide === 'SELL' || lSide === 'SELL' && nSide === 'BUY') &&
        Math.abs(lSize - nSize) < 0.001 &&
        timeDiff < 60
      );
    });
    
    if (matchingNado) {
      hedgedCount++;
    } else {
      unhedgedCount++;
      console.log(`⚠️  UNHEDGED: Lighter ${lSide} ${lSize.toFixed(5)} BTC at ${new Date(lTime).toLocaleString()}`);
    }
  });
  
  console.log(`\n✅ Hedged trades: ${hedgedCount}`);
  console.log(`❌ Unhedged trades: ${unhedgedCount}`);
  
  if (unhedgedCount > 0) {
    console.log('\n⚠️  WARNING: Found unhedged trades! This explains your losses.');
    console.log('   Unhedged positions expose you to directional price risk.');
  } else {
    console.log('\n✅ All trades appear to be properly hedged.');
    console.log('   Losses are likely due to:');
    console.log('   - Fees eating into small spreads');
    console.log('   - Entry/exit gap settings too tight');
    console.log('   - Adverse price movement while holding positions');
  }
  
  console.log('\n═══════════════════════════════════════════════════════════\n');
}

analyzeHedging().catch(error => {
  console.error('Analysis failed:', error.message);
  process.exit(1);
});

