/**
 * Test all API endpoints to verify they work correctly
 */

const axios = require('axios');
require('dotenv').config();

const BASE_URL = 'http://localhost:3000';
const API_KEY = process.env.WEB_API_KEY || process.env.WEB_PASSWORD || 'CHANGE_ME_IN_PRODUCTION';

async function testEndpoint(name, method, path) {
  try {
    console.log(`Testing ${name}...`);
    const config = {
      method,
      url: `${BASE_URL}${path}`,
      headers: {
        'X-API-KEY': API_KEY
      },
      timeout: 15000
    };

    const response = await axios(config);
    console.log(`  ✅ ${name}: ${response.status} ${response.statusText}`);
    
    // Show sample of response
    if (response.data && typeof response.data === 'object') {
      const keys = Object.keys(response.data);
      console.log(`     Keys: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`);
    }
    
    return true;
  } catch (error) {
    if (error.response) {
      console.log(`  ❌ ${name}: ${error.response.status} ${error.response.statusText}`);
    } else if (error.code === 'ECONNREFUSED') {
      console.log(`  ⚠️  ${name}: Server not running (start with: npm run start:web)`);
    } else {
      console.log(`  ❌ ${name}: ${error.message}`);
    }
    return false;
  }
}

async function main() {
  console.log('');
  console.log('═'.repeat(60));
  console.log('🧪 API ENDPOINT TESTING');
  console.log('═'.repeat(60));
  console.log('');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`API Key: ${API_KEY.substring(0, 10)}...`);
  console.log('');

  const tests = [
    // Health check (no auth required)
    ['Health Check', 'GET', '/health'],
    
    // Core endpoints
    ['Bot Status', 'GET', '/api/status'],
    ['Positions', 'GET', '/api/positions'],
    ['Market Data', 'GET', '/api/market'],
    ['Balances', 'GET', '/api/balances'],
    ['Hedging Status', 'GET', '/api/hedging'],
    ['Trading Stats', 'GET', '/api/stats'],
    ['Dashboard (All)', 'GET', '/api/dashboard'],
    ['Logs', 'GET', '/api/logs?limit=10'],
  ];

  let passed = 0;
  let failed = 0;

  for (const [name, method, path] of tests) {
    const result = await testEndpoint(name, method, path);
    if (result) passed++;
    else failed++;
    console.log('');
  }

  console.log('═'.repeat(60));
  console.log('📊 TEST RESULTS');
  console.log('═'.repeat(60));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('');

  if (failed > 0 && failed === tests.length) {
    console.log('⚠️  All tests failed - is the web server running?');
    console.log('💡 Start it with: npm run start:web');
  } else if (passed === tests.length) {
    console.log('🎉 All endpoints working correctly!');
  }

  console.log('');
}

main().catch(error => {
  console.error('Test suite error:', error.message);
  process.exit(1);
});

