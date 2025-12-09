/**
 * Check Nado Gateway REST API directly for position data
 */

require('dotenv').config();
const axios = require('axios');
const config = require('./config.json');
const { ethers } = require('ethers');

async function checkGatewayRest() {
  console.log('🔍 Checking Nado Gateway REST API for positions...\n');
  
  const GATEWAY = 'https://gateway.prod.nado.xyz/v1';
  const address = config.nado.walletAddress;
  
  // Create sender hash
  const sender = ethers.solidityPacked(
    ['address', 'bytes12'],
    [address, ethers.zeroPadValue('0x64656661756c74', 12)] // "default"
  );
  
  console.log('Wallet:', address);
  console.log('Sender (with default):', sender);
  console.log('');
  
  // Try query endpoint with subaccount_info
  console.log('=== Method 1: Query subaccount_info ===');
  try {
    const response = await axios.post(`${GATEWAY}/query`, {
      type: 'subaccount_info',
      subaccount: sender
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log('Response:', JSON.stringify(response.data, null, 2).substring(0, 1000));
    
    // Check for position data
    const data = response.data?.data;
    if (data && data.balances) {
      console.log('\nBalances count:', data.balances.length);
      
      // Find BTC-PERP (productId 2)
      const btcBalance = data.balances.find(b => b[0] === 2 || b.product_id === 2);
      if (btcBalance) {
        console.log('BTC-PERP balance:', JSON.stringify(btcBalance, null, 2));
      } else {
        console.log('No BTC-PERP position found');
      }
    }
  } catch (error) {
    console.log('Error:', error.response?.data || error.message);
  }
  console.log('');
  
  // Try with just owner address (no subaccount name)
  const senderNoSub = ethers.solidityPacked(
    ['address', 'bytes12'],
    [address, ethers.zeroPadValue('0x', 12)] // Empty subaccount
  );
  
  console.log('=== Method 2: Query with empty subaccount ===');
  console.log('Sender (no subaccount):', senderNoSub);
  try {
    const response = await axios.post(`${GATEWAY}/query`, {
      type: 'subaccount_info',
      subaccount: senderNoSub
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log('Response:', JSON.stringify(response.data, null, 2).substring(0, 1000));
    
    const data = response.data?.data;
    if (data && data.balances) {
      console.log('\nBalances found:', data.balances.length);
      const btcBalance = data.balances.find(b => (b[0] === 2 || b.product_id === 2) && b.type === 1);
      if (btcBalance) {
        console.log('BTC-PERP position:', JSON.stringify(btcBalance, null, 2));
      }
    }
  } catch (error) {
    console.log('Error:', error.response?.data || error.message);
  }
}

checkGatewayRest().catch(console.error);

