/**
 * Test Lighter account endpoint with different parameters
 */

const axios = require('axios');
const config = require('./config.json');

async function testAccountEndpoint() {
  const baseUrl = config.lighter.restApiUrl;
  const accountIndex = config.lighter.accountIndex;
  
  console.log('Testing /api/v1/account with different params...\n');
  
  // Test with "by" parameter
  const tests = [
    { by: 'account_index', account_index: accountIndex },
    { by: 'address', address: config.nado.walletAddress },
    { account_index: accountIndex },
  ];
  
  for (const params of tests) {
    try {
      console.log('Trying params:', JSON.stringify(params));
      const response = await axios.get(`${baseUrl}/api/v1/account`, {
        params,
        timeout: 10000
      });
      console.log('✅ Success!');
      console.log(JSON.stringify(response.data, null, 2));
      console.log('\n' + '='.repeat(60) + '\n');
    } catch (error) {
      console.log('❌ Failed:', error.response?.data?.message || error.message);
      console.log('\n');
    }
  }
  
  // Try WebSocket-style query (like the bot might use)
  console.log('\n=== Trying contract-based queries ===\n');
  
  try {
    console.log('Checking if account exists on-chain...');
    // The web interface shows positions - maybe we need blockchain query
    console.log('Account address:', config.nado.walletAddress);
    console.log('Note: Positions might only be queryable via blockchain RPC, not REST API');
    console.log('\nSuggestion: Check positions manually at https://app.lighter.xyz/trade/BTC');
    console.log('The web interface can see positions, but API access may be limited.');
  } catch (error) {
    console.log('Failed:', error.message);
  }
}

testAccountEndpoint().catch(console.error);

