#!/usr/bin/env node
/**
 * Test margin check with 0.5 BTC position
 */

const config = require('./config.json');

console.log('═'.repeat(70));
console.log('🧪 TESTING MARGIN CHECK FOR 0.5 BTC LIMIT ORDER');
console.log('═'.repeat(70));
console.log('');

// Test parameters
const positionSize = 0.5;
const testPrice = 50000;
const leverage = config.risk.maxLeverage;
const bufferPercent = config.risk.minMarginBufferPercent;

console.log('📊 TEST PARAMETERS:');
console.log('  Position size: ' + positionSize + ' BTC');
console.log('  Test price: $' + testPrice.toLocaleString());
console.log('  Leverage: ' + leverage + 'x');
console.log('  Margin buffer: ' + bufferPercent + '%');
console.log('');

// Calculate required margin
const notionalValue = positionSize * testPrice;
const baseMargin = notionalValue / leverage;
const marginWithBuffer = baseMargin * (1 + bufferPercent / 100);

console.log('💰 MARGIN CALCULATION:');
console.log('  Notional value: $' + notionalValue.toLocaleString());
console.log('  Base margin (÷' + leverage + '): $' + baseMargin.toLocaleString());
console.log('  With ' + bufferPercent + '% buffer: $' + marginWithBuffer.toLocaleString());
console.log('');

// Get Lighter account balance
const axios = require('axios');

async function testMarginCheck() {
  try {
    const response = await axios.get(config.lighter.restApiUrl + '/api/v1/account', {
      params: {
        by: 'index',
        value: config.lighter.accountIndex
      }
    });

    const account = response.data.accounts[0];
    const availableBalance = parseFloat(account.available_balance);

    console.log('🔷 LIGHTER ACCOUNT:');
    console.log('  Available balance: $' + availableBalance.toLocaleString());
    console.log('  Total assets: $' + parseFloat(account.total_asset_value).toLocaleString());
    console.log('');

    console.log('✅ MARGIN CHECK RESULT:');
    console.log('  Required: $' + marginWithBuffer.toLocaleString());
    console.log('  Available: $' + availableBalance.toLocaleString());
    
    const excess = availableBalance - marginWithBuffer;
    
    if (excess >= 0) {
      console.log('  Status: ✅ PASS');
      console.log('  Excess margin: $' + excess.toLocaleString());
      console.log('');
      console.log('🎉 You can place this order with no problems!');
    } else {
      console.log('  Status: ❌ FAIL');
      console.log('  Shortfall: $' + Math.abs(excess).toLocaleString());
      console.log('');
      console.log('⚠️  Insufficient margin for this order.');
    }
    
    console.log('');
    console.log('═'.repeat(70));
    
    // Show what would happen with real bot
    console.log('');
    console.log('🤖 BOT BEHAVIOR:');
    if (excess >= 0) {
      console.log('  ✅ Bot WILL execute trades with these settings');
      console.log('  ✅ Margin check will PASS');
      console.log('  ✅ Orders will be placed on both exchanges');
    } else {
      console.log('  ❌ Bot will SKIP trades');
      console.log('  ❌ Margin check will FAIL');
      console.log('  ⚠️  Risk check will block order placement');
    }
    console.log('');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testMarginCheck();

