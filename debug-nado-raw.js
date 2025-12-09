/**
 * Debug Nado SDK - Get raw unfiltered response
 */

require('dotenv').config();
const { NadoExchange } = require('./dist/exchanges/nado.js');
const { createLogger } = require('./dist/utils/logger.js');
const config = require('./config.json');

async function debugNadoRaw() {
  console.log('🔍 Getting RAW Nado SDK Response...\n');
  
  const logger = createLogger('info');
  const nadoExchange = new NadoExchange(config.nado, logger, false);
  
  await nadoExchange.initialize();
  
  console.log('Querying subaccount summary directly from SDK...\n');
  
  // Access the SDK client directly
  const nadoClient = nadoExchange.nadoClient;
  const accountAddress = config.nado.walletAddress;
  
  // Try with empty subaccount name (main account)
  console.log('=== Trying with empty subaccount name ===');
  try {
    const summary = await nadoClient.context.engineClient.getSubaccountSummary({
      subaccountOwner: accountAddress,
      subaccountName: '',
    });
    
    console.log('\nFull Response Structure:');
    console.log('Keys:', Object.keys(summary));
    console.log('\nBalances type:', Array.isArray(summary.balances) ? 'Array' : typeof summary.balances);
    console.log('Balances length:', summary.balances?.length);
    
    // Check if any balance has non-zero amount
    if (summary.balances && Array.isArray(summary.balances)) {
      console.log('\n=== Checking all balances for non-zero amounts ===');
      for (let i = 0; i < summary.balances.length; i++) {
        const balance = summary.balances[i];
        const amount = balance.amount || '0';
        const vQuoteBalance = balance.vQuoteBalance || '0';
        
        // Check if this is BTC-PERP (product 2)
        if (balance.productId === 2) {
          console.log('\n🎯 Found BTC-PERP (productId: 2):');
          console.log('Full balance object:', JSON.stringify(balance, null, 2));
          console.log('\nParsed values:');
          console.log('  amount (string):', amount);
          console.log('  amount (parsed):', parseFloat(amount));
          console.log('  vQuoteBalance:', vQuoteBalance);
          console.log('  type:', balance.type);
        }
        
        // Also check if ANY product has non-zero amount
        if (parseFloat(amount) !== 0 || parseFloat(vQuoteBalance) !== 0) {
          console.log(`\n⚠️ Product ${balance.productId} has non-zero values:`);
          console.log('  amount:', amount);
          console.log('  vQuoteBalance:', vQuoteBalance);
          console.log('  type:', balance.type);
        }
      }
    }
    
    console.log('\n=== Full balances array (first 3 items) ===');
    if (summary.balances) {
      console.log(JSON.stringify(summary.balances.slice(0, 3), null, 2));
    }
    
  } catch (error) {
    console.log('Error:', error.message);
  }
  
  // Also try with 'default' subaccount
  console.log('\n\n=== Trying with "default" subaccount name ===');
  try {
    const summary = await nadoClient.context.engineClient.getSubaccountSummary({
      subaccountOwner: accountAddress,
      subaccountName: 'default',
    });
    
    console.log('Response keys:', Object.keys(summary));
    console.log('Balances length:', summary.balances?.length);
    
    if (summary.balances && Array.isArray(summary.balances)) {
      const btcPerp = summary.balances.find(b => b.productId === 2);
      if (btcPerp) {
        console.log('\nBTC-PERP balance:', JSON.stringify(btcPerp, null, 2));
      }
    }
  } catch (error) {
    console.log('Error:', error.message);
  }
}

debugNadoRaw().catch(console.error);

