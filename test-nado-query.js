/**
 * Test Nado GraphQL queries to find the right format
 */

const axios = require('axios');
const config = require('./config.json');

async function testQueries() {
  console.log('Testing Nado GraphQL queries...\n');
  console.log('Wallet Address:', config.nado.walletAddress);
  console.log('Subaccount Hash:', config.nado.subAccountHash);
  console.log('Subaccount ID:', config.nado.subAccountId);
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Test 1: Query with wallet address
  try {
    console.log('Test 1: Query with wallet address');
    const response = await axios.post(
      'https://gateway.prod.nado.xyz/v1/query',
      {
        query: `query { getPerpPositions(address: "${config.nado.walletAddress}") { positions { symbol size entryPrice } } }`
      },
      { timeout: 10000 }
    );
    console.log('✅ Success!');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ Failed:', error.response?.status, error.response?.data || error.message);
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Test 2: Query with subaccount hash (if available)
  if (config.nado.subAccountHash) {
    try {
      console.log('Test 2: Query with subaccount hash');
      const response = await axios.post(
        'https://gateway.prod.nado.xyz/v1/query',
        {
          query: `query { getPerpPositions(subaccountHash: "${config.nado.subAccountHash}") { positions { symbol size entryPrice } } }`
        },
        { timeout: 10000 }
      );
      console.log('✅ Success!');
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.log('❌ Failed:', error.response?.status, error.response?.data || error.message);
    }
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Test 3: Get account info
  try {
    console.log('Test 3: Get account info');
    const response = await axios.post(
      'https://gateway.prod.nado.xyz/v1/query',
      {
        query: `query { getAccount(address: "${config.nado.walletAddress}") { address subaccounts { hash id positions { symbol size } } } }`
      },
      { timeout: 10000 }
    );
    console.log('✅ Success!');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ Failed:', error.response?.status, error.response?.data || error.message);
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Test 4: Get positions by subaccount ID
  if (config.nado.subAccountId) {
    try {
      console.log('Test 4: Query with subaccount ID');
      const response = await axios.post(
        'https://gateway.prod.nado.xyz/v1/query',
        {
          query: `query { getPositions(subaccountId: ${config.nado.subAccountId}) { symbol size entryPrice } }`
        },
        { timeout: 10000 }
      );
      console.log('✅ Success!');
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.log('❌ Failed:', error.response?.status, error.response?.data || error.message);
    }
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Test 5: REST API endpoint
  try {
    console.log('Test 5: REST API positions endpoint');
    const response = await axios.get(
      'https://api.nado.xyz/v1/positions',
      { 
        params: { address: config.nado.walletAddress },
        timeout: 10000 
      }
    );
    console.log('✅ Success!');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ Failed:', error.response?.status, error.response?.data || error.message);
  }
}

testQueries().catch(console.error);

