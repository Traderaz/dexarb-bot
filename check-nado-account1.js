/**
 * Check Nado account 1 (not default account 0)
 */

require('dotenv').config();
const { NadoExchange } = require('./dist/exchanges/nado.js');
const { createLogger } = require('./dist/utils/logger.js');
const config = require('./config.json');

async function checkAccount1() {
  console.log('🔍 Checking Nado Account 1...\n');
  
  const logger = createLogger('error');
  const nadoExchange = new NadoExchange(config.nado, logger, false);
  await nadoExchange.initialize();
  
  const address = config.nado.walletAddress;
  
  // Query account 1 instead of default
  // Account names: "", "default", "1", etc.
  const accountNames = ['1', 'account1', 'Account 1'];
  
  for (const accountName of accountNames) {
    console.log(`\n=== Trying subaccount name: "${accountName}" ===`);
    try {
      const summary = await nadoExchange.nadoClient.context.engineClient.getSubaccountSummary({
        subaccountOwner: address,
        subaccountName: accountName,
      });
      
      console.log('✅ Success! Account exists:', summary.exists);
      console.log('Balances count:', summary.balances?.length);
      
      if (summary.balances) {
        let foundPosition = false;
        summary.balances.forEach((balance, idx) => {
          const amount = parseFloat(String(balance.amount || '0'));
          const vQuoteBalance = parseFloat(String(balance.vQuoteBalance || '0'));
          
          if (Math.abs(amount) > 0.00001 || Math.abs(vQuoteBalance) > 0.00001) {
            foundPosition = true;
            console.log(`\n🎯 Found position at index ${idx}:`);
            console.log('  Product ID:', balance.productId);
            console.log('  Type:', balance.type, '(0=spot, 1=perp)');
            console.log('  Amount:', String(balance.amount));
            console.log('  vQuoteBalance:', String(balance.vQuoteBalance));
            console.log('  Oracle Price:', balance.oraclePrice);
          }
        });
        
        if (!foundPosition) {
          console.log('No positions found in this account');
        }
      }
      
    } catch (error) {
      console.log('❌ Error:', error.message);
    }
  }
}

checkAccount1().catch(console.error);

