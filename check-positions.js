/**
 * Check current positions on Nado and Lighter
 */

const axios = require('axios');
const config = require('./config.json');

async function checkNadoPosition() {
  try {
    console.log('📊 Checking Nado position...');
    const response = await axios.post(
      'https://gateway.prod.nado.xyz/v1/query',
      {
        query: `query { getPerpPositions(address: "${config.nado.walletAddress}") { positions { symbol size entryPrice markPrice unrealizedPnl } } }`
      },
      { timeout: 10000 }
    );
    
    const positions = response.data?.data?.getPerpPositions?.positions || [];
    const btcPosition = positions.find(p => p.symbol === 'BTC-PERP');
    
    if (btcPosition && Math.abs(parseFloat(btcPosition.size)) > 0.001) {
      console.log('✅ Nado Position Found:');
      console.log(`   Symbol: ${btcPosition.symbol}`);
      console.log(`   Size: ${btcPosition.size} BTC`);
      console.log(`   Entry Price: $${btcPosition.entryPrice}`);
      console.log(`   Mark Price: $${btcPosition.markPrice}`);
      console.log(`   Unrealized PnL: $${btcPosition.unrealizedPnl}`);
      return parseFloat(btcPosition.size);
    } else {
      console.log('✅ Nado: No open position');
      return 0;
    }
  } catch (error) {
    console.error('❌ Failed to get Nado position:', error.message);
    return null;
  }
}

async function checkLighterPosition() {
  try {
    console.log('\n📊 Checking Lighter position...');
    
    // Try to get position from Lighter API
    const response = await axios.get(`${config.lighter.restApiUrl}/api/v1/accounts`, {
      params: {
        account_index: config.lighter.accountIndex
      },
      timeout: 10000
    });
    
    console.log('Lighter API response:', JSON.stringify(response.data, null, 2));
    
    // Parse response for BTC-PERP position (market_id: 1)
    const positions = response.data?.positions || [];
    const btcPosition = positions.find(p => p.market_id === 1);
    
    if (btcPosition && Math.abs(parseFloat(btcPosition.size)) > 0.001) {
      console.log('✅ Lighter Position Found:');
      console.log(`   Market ID: ${btcPosition.market_id}`);
      console.log(`   Size: ${btcPosition.size} BTC`);
      console.log(`   Entry Price: $${btcPosition.entry_price}`);
      return parseFloat(btcPosition.size);
    } else {
      console.log('✅ Lighter: No open position');
      return 0;
    }
  } catch (error) {
    console.error('❌ Failed to get Lighter position:', error.message);
    console.log('⚠️  Note: Lighter position API may not be available');
    console.log('   Please check manually at: https://app.lighter.xyz/trade/BTC');
    return null;
  }
}

async function checkPrices() {
  try {
    console.log('\n💰 Current Prices:');
    
    // Nado price
    try {
      const nadoResp = await axios.get('https://api.nado.xyz/v1/orderbook/BTC-PERP', { timeout: 5000 });
      const nadoBid = parseFloat(nadoResp.data.bids[0]?.[0] || 0);
      const nadoAsk = parseFloat(nadoResp.data.asks[0]?.[0] || 0);
      console.log(`   Nado: Bid $${nadoBid.toFixed(2)} | Ask $${nadoAsk.toFixed(2)} | Mid $${((nadoBid + nadoAsk) / 2).toFixed(2)}`);
    } catch (e) {
      console.log('   Nado: Unable to fetch price');
    }
    
    // Lighter price
    try {
      const lighterResp = await axios.get(`${config.lighter.restApiUrl}/api/v1/orderBookOrders`, {
        params: { market_id: 1, limit: 1 },
        timeout: 5000
      });
      const lighterBid = parseFloat(lighterResp.data.bids[0]?.price || 0);
      const lighterAsk = parseFloat(lighterResp.data.asks[0]?.price || 0);
      console.log(`   Lighter: Bid $${lighterBid.toFixed(2)} | Ask $${lighterAsk.toFixed(2)} | Mid $${((lighterBid + lighterAsk) / 2).toFixed(2)}`);
      
      if (lighterBid > 0 && nadoBid > 0) {
        const gap = Math.abs(((lighterBid + lighterAsk) / 2) - ((nadoBid + nadoAsk) / 2));
        console.log(`\n   📈 Current Gap: $${gap.toFixed(2)}`);
      }
    } catch (e) {
      console.log('   Lighter: Unable to fetch price');
    }
  } catch (error) {
    console.error('Failed to get prices');
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 POSITION CHECK');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const nadoSize = await checkNadoPosition();
  const lighterSize = await checkLighterPosition();
  
  await checkPrices();
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  
  if (nadoSize !== null && lighterSize !== null) {
    if (Math.abs(nadoSize) < 0.001 && Math.abs(lighterSize) < 0.001) {
      console.log('✅ FLAT - No open positions on either exchange');
    } else if (Math.abs(nadoSize - lighterSize) < 0.001) {
      console.log('⚠️  HEDGED - Equal and opposite positions detected');
      console.log(`   Net exposure: ${Math.abs(nadoSize - lighterSize).toFixed(4)} BTC`);
    } else {
      console.log('🚨 UNHEDGED POSITION DETECTED!');
      console.log(`   Nado: ${nadoSize} BTC`);
      console.log(`   Lighter: ${lighterSize || 'Unknown'} BTC`);
      console.log(`   Net exposure: ${Math.abs(nadoSize + (lighterSize || 0)).toFixed(4)} BTC`);
      console.log('\n   ⚠️  MANUAL ACTION REQUIRED - Close unhedged position!');
    }
  } else {
    console.log('⚠️  Unable to verify all positions - check manually');
    if (nadoSize !== null) console.log(`   Nado: ${nadoSize} BTC`);
    if (lighterSize !== null) console.log(`   Lighter: ${lighterSize} BTC`);
  }
  
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(console.error);

