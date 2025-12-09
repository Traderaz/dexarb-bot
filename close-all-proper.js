/**
 * Proper close using the working Nado SDK method
 */

const { createNadoClient, CHAIN_ENV_TO_CHAIN } = require('@nadohq/client');
const { createPublicClient, createWalletClient, http } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const axios = require('axios');
require('dotenv').config(); // Load .env file

async function getNadoPositions() {
  try {
    const config = require('./config.json');
    
    console.log('🔍 Checking Nado positions using SDK...');
    
    // Initialize Nado SDK (same way the bot does)
    const privateKey = process.env.ETH_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('ETH_PRIVATE_KEY not found in .env file');
    }
    
    const account = privateKeyToAccount(`0x${privateKey}`);
    const chainEnv = 'inkMainnet';
    const chain = CHAIN_ENV_TO_CHAIN[chainEnv];
    const rpcUrl = 'https://rpc-gel.inkonchain.com';
    
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    });
    
    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });
    
    const nadoClient = createNadoClient(chainEnv, {
      walletClient,
      publicClient,
    });
    
    // Get subaccount summary
    const summary = await nadoClient.context.engineClient.getSubaccountSummary({
      subaccountOwner: config.nado.walletAddress,
      subaccountName: 'default',
    });
    
    console.log('📊 Nado Summary:', JSON.stringify(summary, null, 2));
    
    // Extract positions from balances array
    const positions = [];
    const summaryData = summary;
    
    if (summaryData.balances && Array.isArray(summaryData.balances)) {
      for (const balance of summaryData.balances) {
        // type: 1 = perpetual position
        if (balance.type === 1 && balance.amount) {
          const sizeWei = BigInt(balance.amount);
          // Convert from wei (18 decimals) to BTC
          const size = Number(sizeWei) / 1e18;
          
          if (Math.abs(size) > 0.0001) {
            // Product ID 2 = BTC-PERP
            const symbol = balance.productId === 2 ? 'BTC-PERP' : `PRODUCT-${balance.productId}`;
            positions.push({
              symbol,
              productId: balance.productId,
              size,
              side: size > 0 ? 'long' : 'short',
              oraclePrice: parseFloat(balance.oraclePrice)
            });
          }
        }
      }
    }
    
    return { positions, nadoClient };
    
  } catch (error) {
    console.error('❌ Failed to get Nado positions:', error.message);
    throw error;
  }
}

async function closeNadoPosition(position, nadoClient) {
  try {
    const config = require('./config.json');
    
    console.log(`\n📝 Closing Nado ${position.side.toUpperCase()} position: ${Math.abs(position.size)} BTC`);
    
    // Get current market price from oracle
    const isLong = position.size > 0;
    const side = isLong ? 'sell' : 'buy';
    const sizeAbs = Math.abs(position.size);
    const oraclePrice = position.oraclePrice;
    
    // Aggressive price (0.5% through the spread) 
    const aggressiveFactor = side === 'buy' ? 1.005 : 0.995;
    const limitPrice = oraclePrice * aggressiveFactor;
    
    console.log(`   Oracle price: $${oraclePrice.toFixed(2)}`);
    console.log(`   Limit price: $${limitPrice.toFixed(2)} (${side.toUpperCase()})`);
    console.log(`   Size: ${sizeAbs} BTC`);
    console.log(`   Using Nado SDK to place reduce-only order...`);
    
    // Use SDK's order placement (most reliable method)
    // The SDK handles all the signing and formatting
    const result = await nadoClient.placeOrder({
      productId: position.productId,
      isBuy: side === 'buy',
      orderType: 'limit',
      price: limitPrice.toString(),
      size: sizeAbs.toString(),
      reduceOnly: true,
      postOnly: false
    });
    
    console.log('   ✅ Close order placed via SDK:', result);
    return result;
    
  } catch (error) {
    console.error('   ❌ Failed to close Nado position:', error.message);
    console.log('   ⚠️  Please close manually at: https://app.nado.xyz/');
    throw error;
  }
}

async function closeLighterPosition(size) {
  try {
    const config = require('./config.json');
    
    console.log(`\n📝 Closing Lighter position: ${size} BTC`);
    
    const LighterOrderClient = require('./lighter-order.js');
    const client = new LighterOrderClient({
      apiKey: config.lighter.apiKey,
      accountIndex: config.lighter.accountIndex,
      apiKeyIndex: config.lighter.apiKeyIndex,
      chainId: config.lighter.chainId,
      baseUrl: config.lighter.restApiUrl
    });
    
    await client.initialize();
    
    // Get current price
    const priceResp = await axios.get(`${config.lighter.restApiUrl}/api/v1/orderBookOrders`, {
      params: { market_id: 1, limit: 1 },
      timeout: 5000
    });
    const bid = parseFloat(priceResp.data.bids[0]?.price || 0);
    const ask = parseFloat(priceResp.data.asks[0]?.price || 0);
    const midPrice = (bid + ask) / 2;
    
    const isLong = size > 0;
    const side = isLong ? 'sell' : 'buy';
    const sizeAbs = Math.abs(size);
    
    // Aggressive price (0.5% through the spread)
    const aggressiveFactor = side === 'buy' ? 1.005 : 0.995;
    const limitPrice = midPrice * aggressiveFactor;
    
    console.log(`   Current price: $${midPrice.toFixed(2)}`);
    console.log(`   Limit price: $${limitPrice.toFixed(2)} (${side.toUpperCase()})`);
    console.log(`   Size: ${sizeAbs} BTC`);
    
    // Place reduce-only order
    const result = await client.placeLimitOrder(1, side, sizeAbs, limitPrice);
    
    console.log('   ✅ Close order placed:', result);
    return result;
    
  } catch (error) {
    console.error('   ❌ Failed to close Lighter position:', error.message);
    throw error;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🚨 EMERGENCY CLOSE - PROPER METHOD');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  try {
    // Get Nado positions using SDK
    const result = await getNadoPositions();
    const nadoPositions = result.positions;
    const nadoClient = result.nadoClient;
    
    if (nadoPositions.length === 0) {
      console.log('✅ No Nado positions found');
    } else {
      console.log(`\n📍 Found ${nadoPositions.length} Nado position(s):`);
      nadoPositions.forEach(pos => {
        console.log(`   ${pos.symbol}: ${pos.size} BTC (${pos.side})`);
      });
      
      // Close each position
      for (const position of nadoPositions) {
        await closeNadoPosition(position, nadoClient);
      }
    }
    
    // For Lighter, ask user since we can't query
    console.log('\n⚠️  Lighter position query not available');
    console.log('⚠️  If you have a Lighter position, manually specify it:');
    console.log('   1. Check https://app.lighter.xyz/trade/BTC');
    console.log('   2. If you have a position, note the size (e.g., +0.01 for LONG, -0.01 for SHORT)');
    console.log('   3. Run: node close-lighter-manual.js <size>');
    console.log('      Example: node close-lighter-manual.js 0.01  (closes LONG)');
    console.log('      Example: node close-lighter-manual.js -0.01 (closes SHORT)');
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ NADO CLOSE COMPLETE');
    console.log('═══════════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('\n❌ FAILED:', error.message);
    process.exit(1);
  }
}

main();

