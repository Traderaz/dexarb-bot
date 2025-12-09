/**
 * Find all Nado product IDs and their symbols
 */

require('dotenv').config();
const axios = require('axios');

async function findNadoProducts() {
  console.log('🔍 Finding all Nado products...\n');
  
  const GATEWAY_URL = 'https://gateway.prod.nado.xyz/v1';
  
  // Try to get all products/markets
  console.log('Method 1: Query all products...');
  try {
    const response = await axios.post(`${GATEWAY_URL}/query`, {
      type: 'all_products'
    });
    
    console.log('Products:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('Error:', error.response?.data || error.message);
  }
  console.log('');
  
  // Try individual product queries
  console.log('Method 2: Query individual product IDs...');
  for (let productId = 0; productId <= 25; productId++) {
    try {
      const response = await axios.post(`${GATEWAY_URL}/query`, {
        type: 'product_info',
        product_id: productId
      });
      
      if (response.data) {
        console.log(`Product ${productId}:`, JSON.stringify(response.data).substring(0, 200));
      }
    } catch (error) {
      // Skip errors
    }
  }
  console.log('');
  
  // Check the SDK's product mapping
  console.log('Method 3: Check what symbols the SDK knows about...');
  const { NadoExchange } = require('./dist/exchanges/nado.js');
  const { createLogger } = require('./dist/utils/logger.js');
  const config = require('./config.json');
  
  const logger = createLogger('error'); // Quiet
  const nado = new NadoExchange(config.nado, logger, false);
  
  // Check the productIdToSymbol mapping
  console.log('Checking product ID mappings in our code:');
  for (let i = 0; i <= 25; i++) {
    const symbol = nado.productIdToSymbol(i);
    if (symbol !== `UNKNOWN-${i}`) {
      console.log(`  Product ${i} -> ${symbol}`);
    }
  }
}

findNadoProducts().catch(console.error);

