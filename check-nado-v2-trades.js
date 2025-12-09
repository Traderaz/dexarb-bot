/**
 * Check Nado V2 API for recent trades
 */

require('dotenv').config();
const axios = require('axios');
const config = require('./config.json');

async function checkV2Trades() {
  console.log('🔍 Checking Nado V2 API for recent trades...\n');
  console.log('Wallet:', config.nado.walletAddress);
  console.log('');
  
  const ARCHIVE_V2 = 'https://archive.prod.nado.xyz/v2';
  
  // Query trades for BTC-PERP (BTCUSDT0)
  console.log('=== Recent BTC-PERP Trades ===');
  try {
    const response = await axios.get(`${ARCHIVE_V2}/trades`, {
      params: {
        ticker_id: 'BTC-PERP_USDT0',
        limit: 20
      }
    });
    
    console.log('Found', response.data.length, 'recent trades');
    console.log('\nTrades:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('Error:', error.response?.status, error.response?.data || error.message);
  }
  console.log('');
  
  // Also try to get account-specific data if available
  console.log('=== Trying account-specific endpoints ===');
  
  // Try positions endpoint
  console.log('\n1. Positions endpoint...');
  try {
    const response = await axios.get(`${ARCHIVE_V2}/positions`, {
      params: {
        address: config.nado.walletAddress
      }
    });
    
    console.log('Positions:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('Error:', error.response?.status, error.response?.data || error.message);
  }
  
  // Try account endpoint
  console.log('\n2. Account endpoint...');
  try {
    const response = await axios.get(`${ARCHIVE_V2}/account`, {
      params: {
        address: config.nado.walletAddress
      }
    });
    
    console.log('Account:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('Error:', error.response?.status, error.response?.data || error.message);
  }
  
  // Try fills/trades for specific account
  console.log('\n3. User trades endpoint...');
  try {
    const response = await axios.get(`${ARCHIVE_V2}/user/trades`, {
      params: {
        address: config.nado.walletAddress,
        limit: 10
      }
    });
    
    console.log('User trades:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('Error:', error.response?.status, error.response?.data || error.message);
  }
}

checkV2Trades().catch(console.error);

