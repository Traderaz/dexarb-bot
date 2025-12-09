/**
 * Quick bot status checker
 * Verifies that the bot is using the correct Lighter client
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Checking Bot Configuration...\n');

// Check 1: Verify lighter.ts is using FFI client
console.log('1️⃣ Checking Lighter Exchange Configuration...');
const lighterTsPath = path.join(__dirname, 'src', 'exchanges', 'lighter.ts');
const lighterTs = fs.readFileSync(lighterTsPath, 'utf8');

if (lighterTs.includes("require('../../lighter-order.js')")) {
  console.log('   ✅ Using FFI-based client (lighter-order.js)');
} else if (lighterTs.includes("require('../../lighter-order-sdk.js')")) {
  console.log('   ❌ Using SDK client (lighter-order-sdk.js) - THIS WILL FAIL!');
  console.log('   ⚠️  Change to: require(\'../../lighter-order.js\')');
} else {
  console.log('   ⚠️  Could not determine client type');
}

// Check 2: Verify DLL exists
console.log('\n2️⃣ Checking DLL Dependency...');
const dllPath = path.join(__dirname, 'lighter-signer-windows-amd64.dll');
if (fs.existsSync(dllPath)) {
  const stats = fs.statSync(dllPath);
  console.log(`   ✅ DLL found (${(stats.size / 1024).toFixed(0)} KB)`);
} else {
  console.log('   ❌ DLL not found - orders will fail!');
  console.log('   📁 Expected: lighter-signer-windows-amd64.dll');
}

// Check 3: Verify build is up to date
console.log('\n3️⃣ Checking Build Status...');
const distPath = path.join(__dirname, 'dist', 'exchanges', 'lighter.js');
if (fs.existsSync(distPath)) {
  const distFile = fs.readFileSync(distPath, 'utf8');
  if (distFile.includes("require('../../lighter-order.js')")) {
    console.log('   ✅ Built version uses FFI client');
  } else {
    console.log('   ⚠️  Built version may be outdated');
    console.log('   🔨 Run: npm run build');
  }
} else {
  console.log('   ❌ No build found');
  console.log('   🔨 Run: npm run build');
}

// Check 4: Verify config has account details
console.log('\n4️⃣ Checking Configuration...');
try {
  const config = require('./config.json');
  if (config.lighter && config.lighter.accountIndex && config.lighter.apiKeyIndex !== undefined) {
    console.log(`   ✅ Account configured (Index: ${config.lighter.accountIndex})`);
  } else {
    console.log('   ⚠️  Lighter configuration incomplete');
  }
} catch (e) {
  console.log('   ❌ Could not read config.json');
}

// Check 5: Environment variables
console.log('\n5️⃣ Checking Environment Variables...');
require('dotenv').config();
if (process.env.ETH_PRIVATE_KEY) {
  console.log(`   ✅ ETH_PRIVATE_KEY found (${process.env.ETH_PRIVATE_KEY.length} chars)`);
} else {
  console.log('   ❌ ETH_PRIVATE_KEY not found in .env');
  console.log('   📝 Add to .env file');
}

console.log('\n' + '='.repeat(50));
console.log('📊 SUMMARY');
console.log('='.repeat(50));

// Overall status
const allGood = 
  lighterTs.includes("require('../../lighter-order.js')") &&
  fs.existsSync(dllPath) &&
  fs.existsSync(distPath) &&
  process.env.ETH_PRIVATE_KEY;

if (allGood) {
  console.log('✅ Bot is properly configured!');
  console.log('🚀 Ready to start: npm start');
} else {
  console.log('⚠️  Some issues detected - see above for details');
}

console.log('');

