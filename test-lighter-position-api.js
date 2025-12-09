/**
 * Test different Lighter API endpoints to find position query
 */

const axios = require('axios');
const config = require('./config.json');

async function testLighterAPIs() {
  const baseUrl = config.lighter.restApiUrl;
  const accountIndex = config.lighter.accountIndex;
  const apiKeyIndex = config.lighter.apiKeyIndex;
  
  console.log('Testing Lighter Position APIs...');
  console.log('Account Index:', accountIndex);
  console.log('API Key Index:', apiKeyIndex);
  console.log('Base URL:', baseUrl);
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Test 1: Get account info
  try {
    console.log('Test 1: GET /api/v1/account');
    const response = await axios.get(`${baseUrl}/api/v1/account`, {
      params: {
        account_index: accountIndex,
        api_key_index: apiKeyIndex
      },
      timeout: 10000
    });
    console.log('✅ Success!');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ Failed:', error.response?.status, error.response?.data || error.message);
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Test 2: Get positions
  try {
    console.log('Test 2: GET /api/v1/positions');
    const response = await axios.get(`${baseUrl}/api/v1/positions`, {
      params: {
        account_index: accountIndex,
        api_key_index: apiKeyIndex
      },
      timeout: 10000
    });
    console.log('✅ Success!');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ Failed:', error.response?.status, error.response?.data || error.message);
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Test 3: Get account data
  try {
    console.log('Test 3: GET /api/v1/accountData');
    const response = await axios.get(`${baseUrl}/api/v1/accountData`, {
      params: {
        account_index: accountIndex
      },
      timeout: 10000
    });
    console.log('✅ Success!');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ Failed:', error.response?.status, error.response?.data || error.message);
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Test 4: Query specific market position
  try {
    console.log('Test 4: GET /api/v1/position (market_id=1 for BTC-PERP)');
    const response = await axios.get(`${baseUrl}/api/v1/position`, {
      params: {
        account_index: accountIndex,
        api_key_index: apiKeyIndex,
        market_id: 1
      },
      timeout: 10000
    });
    console.log('✅ Success!');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ Failed:', error.response?.status, error.response?.data || error.message);
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Test 5: User account endpoint
  try {
    console.log('Test 5: GET /api/v1/user');
    const response = await axios.get(`${baseUrl}/api/v1/user`, {
      params: {
        account_index: accountIndex
      },
      timeout: 10000
    });
    console.log('✅ Success!');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ Failed:', error.response?.status, error.response?.data || error.message);
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Test 6: Portfolio
  try {
    console.log('Test 6: GET /api/v1/portfolio');
    const response = await axios.get(`${baseUrl}/api/v1/portfolio`, {
      params: {
        account_index: accountIndex,
        api_key_index: apiKeyIndex
      },
      timeout: 10000
    });
    console.log('✅ Success!');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ Failed:', error.response?.status, error.response?.data || error.message);
  }
}

testLighterAPIs().catch(console.error);

