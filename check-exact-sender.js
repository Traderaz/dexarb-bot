/**
 * Check with the EXACT sender from the browser
 */

require('dotenv').config();
const axios = require('axios');
const config = require('./config.json');

async function checkExactSender() {
  console.log('🔍 Checking with EXACT sender from browser...\n');
  
  // The exact sender from your trade payload
  const exactSender = '0x159255f7706f7ea15829bf76426cc90a177ce20b64656661756c740000000000';
  
  console.log('Exact sender from browser:', exactSender);
  console.log('Length:', exactSender.length, 'characters');
  console.log('');
  
  // Query using this exact sender
  console.log('=== Querying Nado with exact sender ===');
  try {
    const response = await axios.post('https://gateway.prod.nado.xyz/v1/query', {
      type: 'subaccount_info',
      subaccount: exactSender
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = response.data.data;
    console.log('✅ Status:', response.data.status);
    console.log('Exists:', data.exists);
    console.log('Health:', JSON.stringify(data.healths[0]));
    console.log('');
    
    if (data.balances) {
      console.log('Balances count:', data.balances.length);
      console.log('');
      
      // Check for non-zero positions
      let foundPosition = false;
      data.balances.forEach((balance, idx) => {
        // Handle both array and object formats
        const amount = balance.amount || balance[1] || '0';
        const vQuoteBalance = balance.vQuoteBalance || balance[2] || '0';
        const productId = balance.product_id || balance.productId || balance[0];
        
        const amountNum = parseFloat(String(amount));
        const vqbNum = parseFloat(String(vQuoteBalance));
        
        if (Math.abs(amountNum) > 0.00001 || Math.abs(vqbNum) > 0.00001) {
          foundPosition = true;
          console.log(`🎯 FOUND POSITION #${idx}:`);
          console.log('  Product ID:', productId);
          console.log('  Amount:', String(amount));
          console.log('  vQuoteBalance:', String(vQuoteBalance));
          console.log('  Type:', balance.type);
          console.log('  Full data:', JSON.stringify(balance).substring(0, 200));
          console.log('');
        }
      });
      
      if (!foundPosition) {
        console.log('❌ No non-zero positions found');
        console.log('\nFirst 3 balances:');
        data.balances.slice(0, 3).forEach((b, i) => {
          console.log(`Balance ${i}:`, JSON.stringify(b).substring(0, 150));
        });
      }
    }
  } catch (error) {
    console.log('❌ Error:', error.response?.data || error.message);
  }
}

checkExactSender().catch(console.error);

