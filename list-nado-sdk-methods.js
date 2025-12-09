/**
 * List all available methods in Nado SDK
 */

require('dotenv').config();
const { NadoExchange } = require('./dist/exchanges/nado.js');
const { createLogger } = require('./dist/utils/logger.js');
const config = require('./config.json');

async function listMethods() {
  console.log('📋 Listing all Nado SDK methods...\n');
  
  const logger = createLogger('error');
  const nadoExchange = new NadoExchange(config.nado, logger, false);
  await nadoExchange.initialize();
  
  const client = nadoExchange.nadoClient;
  
  console.log('=== Main Client Properties ===');
  console.log(Object.keys(client));
  console.log('');
  
  console.log('=== Context Properties ===');
  console.log(Object.keys(client.context));
  console.log('');
  
  console.log('=== Engine Client Methods ===');
  const engineClient = client.context.engineClient;
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(engineClient))
    .filter(name => typeof engineClient[name] === 'function' && name !== 'constructor');
  
  console.log('Available methods:');
  methods.forEach(method => {
    console.log(`  - ${method}`);
  });
  
  console.log('');
  console.log('Total methods:', methods.length);
}

listMethods().catch(console.error);

