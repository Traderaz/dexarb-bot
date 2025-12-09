/**
 * Close Nado Position Only
 * Simple script to close Nado positions without FFI dependencies
 */

const axios = require('axios');

async function getNadoPosition() {
  try {
    const config = require('./config.json');
    const response = await axios.post(
      'https://gateway.prod.nado.xyz/v1/query',
      {
        query: `query { getPerpPositions(address: "${config.nado.walletAddress}") { positions { symbol size entryPrice } } }`
      },
      { timeout: 10000 }
    );
    
    const positions = response.data?.data?.getPerpPositions?.positions || [];
    const btcPosition = positions.find(p => p.symbol === 'BTC-PERP');
    return btcPosition ? parseFloat(btcPosition.size) : 0;
  } catch (error) {
    console.error('Failed to get Nado position:', error.message);
    return 0;
  }
}

async function getNadoPrice() {
  try {
    const response = await axios.get('https://api.nado.xyz/v1/orderbook/BTC-PERP', { timeout: 5000 });
    const bid = parseFloat(response.data.bids[0]?.[0] || 0);
    const ask = parseFloat(response.data.asks[0]?.[0] || 0);
    return (bid + ask) / 2;
  } catch (error) {
    console.error('Failed to get Nado price:', error.message);
    return 0;
  }
}

async function closeNadoPosition(size, currentPrice) {
  const config = require('./config.json');
  const isLong = size > 0;
  const side = isLong ? 'sell' : 'buy';
  const sizeAbs = Math.abs(size);
  
  // Use aggressive limit (cross 0.5% to guarantee fill)
  const aggressiveFactor = side === 'buy' ? 1.005 : 0.995;
  const limitPrice = Math.round(currentPrice * aggressiveFactor);
  
  console.log(`Closing Nado ${isLong ? 'LONG' : 'SHORT'} ${sizeAbs} BTC @ ~${limitPrice}`);
  
  const payload = {
    transactions: [{
      action: 'place_order',
      sender: config.nado.walletAddress,
      subaccount_id: config.nado.subAccountId,
      subaccount_hash: config.nado.subAccountHash,
      side: side === 'buy' ? 1 : 2,
      symbol: 'BTC-PERP',
      order_type: 1, // LIMIT
      size: sizeAbs.toString(),
      price: limitPrice.toString(),
      reduce_only: true,
      post_only: false
    }]
  };
  
  const response = await axios.post(
    'https://gateway.prod.nado.xyz/v1/execute',
    payload,
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    }
  );
  
  return response.data;
}

async function main() {
  console.log('\n🚨 Closing Nado Position...\n');
  
  try {
    // Get Nado position
    const nadoPos = await getNadoPosition();
    console.log(`Nado position: ${nadoPos} BTC`);
    
    if (Math.abs(nadoPos) < 0.001) {
      console.log('✅ No Nado position to close');
      console.log('\n⚠️  Note: You must close Lighter position manually at:');
      console.log('   https://app.lighter.xyz/\n');
      return;
    }
    
    // Get current price
    const nadoPrice = await getNadoPrice();
    console.log(`Nado price: $${nadoPrice}`);
    
    // Close Nado position
    const result = await closeNadoPosition(nadoPos, nadoPrice);
    console.log('\n✅ Nado position close order placed!');
    console.log('Result:', JSON.stringify(result, null, 2));
    
    console.log('\n⚠️  Note: You must close Lighter position manually at:');
    console.log('   https://app.lighter.xyz/\n');
    
  } catch (error) {
    console.error('\n❌ Failed to close position:', error.message);
    console.log('\n📱 Please close positions manually:');
    console.log('   Nado: https://app.nado.xyz/');
    console.log('   Lighter: https://app.lighter.xyz/\n');
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { closeNadoPosition, getNadoPosition };

