/**
 * Check Nado SDK perp and subaccount methods
 */

require('dotenv').config();
const { NadoExchange } = require('./dist/exchanges/nado.js');
const { createLogger } = require('./dist/utils/logger.js');
const config = require('./config.json');

async function checkPerpMethods() {
  console.log('🔍 Checking Nado SDK perp and subaccount methods...\n');
  
  const logger = createLogger('error');
  const nadoExchange = new NadoExchange(config.nado, logger, false);
  await nadoExchange.initialize();
  
  const client = nadoExchange.nadoClient;
  
  console.log('=== Perp Methods ===');
  if (client.perp) {
    const perpMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(client.perp))
      .filter(name => typeof client.perp[name] === 'function' && name !== 'constructor');
    
    perpMethods.forEach(method => console.log(`  - ${method}`));
    
    // Try getting positions via perp client
    console.log('\n📊 Trying perp.getPositions()...');
    try {
      if (typeof client.perp.getPositions === 'function') {
        const positions = await client.perp.getPositions();
        console.log('Positions:', JSON.stringify(positions, null, 2));
      } else {
        console.log('getPositions not available');
      }
    } catch (error) {
      console.log('Error:', error.message);
    }
  } else {
    console.log('No perp client available');
  }
  
  console.log('\n=== Subaccount Methods ===');
  if (client.subaccount) {
    const subMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(client.subaccount))
      .filter(name => typeof client.subaccount[name] === 'function' && name !== 'constructor');
    
    subMethods.forEach(method => console.log(`  - ${method}`));
    
    // Try getting summary via subaccount client
    console.log('\n📊 Trying subaccount.getSummary()...');
    try {
      if (typeof client.subaccount.getSummary === 'function') {
        const summary = await client.subaccount.getSummary();
        console.log('Summary:', JSON.stringify(summary, null, 2).substring(0, 500));
      } else {
        console.log('getSummary not available');
      }
    } catch (error) {
      console.log('Error:', error.message);
    }
  } else {
    console.log('No subaccount client available');
  }
  
  console.log('\n=== IndexerClient Methods ===');
  if (client.context.indexerClient) {
    console.log('IndexerClient exists!');
    const indexerMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(client.context.indexerClient))
      .filter(name => typeof client.context.indexerClient[name] === 'function' && name !== 'constructor');
    
    indexerMethods.forEach(method => console.log(`  - ${method}`));
  } else {
    console.log('No indexer client available');
  }
}

checkPerpMethods().catch(console.error);

