/**
 * Check Nado IndexerClient for position/trade data
 */

require('dotenv').config();
const { NadoExchange } = require('./dist/exchanges/nado.js');
const { createLogger } = require('./dist/utils/logger.js');
const config = require('./config.json');
const { ethers } = require('ethers');

async function checkIndexer() {
  console.log('🔍 Checking Nado IndexerClient for trades/positions...\n');
  
  const logger = createLogger('error');
  const nadoExchange = new NadoExchange(config.nado, logger, false);
  await nadoExchange.initialize();
  
  const indexerClient = nadoExchange.nadoClient.context.indexerClient;
  const address = config.nado.walletAddress;
  
  // Create sender hash
  const sender = ethers.solidityPacked(
    ['address', 'bytes12'],
    [address, ethers.zeroPadValue('0x64656661756c74', 12)] // "default"
  );
  
  console.log('Wallet:', address);
  console.log('Sender hash:', sender);
  console.log('');
  
  // Get recent match events (trades/fills)
  console.log('=== Recent Match Events (Trades) ===');
  try {
    const matches = await indexerClient.getPaginatedSubaccountMatchEvents({
      owner: address,
      subaccountName: 'default',
      limit: 10
    });
    
    console.log('Response keys:', Object.keys(matches));
    console.log('Matches:', JSON.stringify(matches, null, 2));
  } catch (error) {
    console.log('Error:', error.message);
  }
  console.log('');
  
  // Get orders
  console.log('=== Recent Orders ===');
  try {
    const orders = await indexerClient.getPaginatedSubaccountOrders({
      owner: address,
      subaccountName: 'default',
      limit: 10
    });
    
    console.log('Orders:', JSON.stringify(orders, null, 2));
  } catch (error) {
    console.log('Error:', error.message);
  }
  console.log('');
  
  // Get funding payments
  console.log('=== Interest/Funding Payments ===');
  try {
    const payments = await indexerClient.getPaginatedSubaccountInterestFundingPayments({
      owner: address,
      subaccountName: 'default',
      limit: 5
    });
    
    console.log('Payments:', JSON.stringify(payments, null, 2));
  } catch (error) {
    console.log('Error:', error.message);
  }
}

checkIndexer().catch(console.error);

