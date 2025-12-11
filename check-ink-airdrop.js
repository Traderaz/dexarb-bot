const axios = require('axios');

async function checkInkAirdrop() {
  try {
    const response = await axios.post(
      'https://gateway.prod.nado.xyz/v1/archive',
      {
        ink_airdrop: {
          address: '0x159255F7706f7Ea15829bF76426cC90a177CE20B'
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept-Encoding': 'gzip, deflate, br'
        }
      }
    );
    
    console.log('✅ Ink Airdrop Amount:', response.data.amount);
    
    // Convert from wei to INK tokens (assuming 18 decimals)
    const amountInTokens = parseFloat(response.data.amount) / 1e18;
    console.log(`📊 Tokens: ${amountInTokens.toLocaleString()} INK`);
    
  } catch (error) {
    if (error.response) {
      console.log('❌ Error Response:');
      console.log('Status:', error.response.status);
      console.log('Data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.log('❌ No response received');
      console.log('Request:', error.request);
    } else {
      console.log('❌ Error:', error.message);
    }
    
    console.log('\n💡 This likely means:');
    console.log('   - Airdrop allocations not finalized yet');
    console.log('   - INK token not launched yet');
    console.log('   - Points still being accumulated');
    console.log('\n✅ Keep farming! Your volume is being tracked.');
  }
}

checkInkAirdrop();

