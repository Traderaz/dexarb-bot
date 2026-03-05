/**
 * Import historical trades into Supabase
 * Run: node import-historical-trades.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Example historical trade format - EDIT THIS with your actual trades
 */
const historicalTrades = [
  // Example trade - replace with your actual data
  // {
  //   trade_id: 'TRADE_001',
  //   entry_timestamp: '2024-01-01T10:00:00Z',
  //   exit_timestamp: '2024-01-01T10:05:00Z',
  //   entry_gap_usd: 150,
  //   exit_gap_usd: 30,
  //   cheap_exchange: 'lighter',
  //   expensive_exchange: 'nado',
  //   position_size_btc: 0.5,
  //   realized_pnl_btc: 0.001,
  //   realized_pnl_usd: 50,
  //   hold_duration_seconds: 300,
  //   entry_price_cheap: 50000,
  //   entry_price_expensive: 50150,
  //   exit_price_long: 50030,
  //   exit_price_short: 50030,
  //   fees_entry: 5,
  //   fees_exit: 5,
  //   fees_total: 10,
  // },
];

/**
 * Import from CSV file (if you have one)
 */
async function importFromCSV(filePath) {
  console.log(`📂 Reading CSV file: ${filePath}`);
  
  // Read CSV file
  const csvContent = fs.readFileSync(filePath, 'utf8');
  const lines = csvContent.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    console.log('❌ CSV file is empty or has no data');
    return [];
  }
  
  // Parse header
  const headers = lines[0].split(',').map(h => h.trim());
  console.log(`📋 CSV Headers:`, headers);
  
  // Parse rows
  const trades = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const trade = {};
    
    headers.forEach((header, index) => {
      trade[header] = values[index];
    });
    
    // Convert to Supabase format
    const dbTrade = {
      trade_id: trade.tradeId || trade.trade_id || `IMPORT_${Date.now()}_${i}`,
      entry_timestamp: trade.entryTimestamp || trade.entry_timestamp || new Date().toISOString(),
      exit_timestamp: trade.exitTimestamp || trade.exit_timestamp || new Date().toISOString(),
      entry_gap_usd: parseFloat(trade.entryGapUsd || trade.entry_gap_usd || 0),
      exit_gap_usd: parseFloat(trade.exitGapUsd || trade.exit_gap_usd || 0),
      cheap_exchange: trade.cheapExchange || trade.cheap_exchange || 'unknown',
      expensive_exchange: trade.expensiveExchange || trade.expensive_exchange || 'unknown',
      position_size_btc: parseFloat(trade.positionSizeBtc || trade.position_size_btc || 0),
      realized_pnl_btc: parseFloat(trade.realizedPnlBtc || trade.realized_pnl_btc || 0),
      realized_pnl_usd: parseFloat(trade.realizedPnlUsd || trade.realized_pnl_usd || 0),
      hold_duration_seconds: parseInt(trade.holdDurationSeconds || trade.hold_duration_seconds || 0),
      entry_price_cheap: parseFloat(trade.entryPriceCheap || trade.entry_price_cheap || 0),
      entry_price_expensive: parseFloat(trade.entryPriceExpensive || trade.entry_price_expensive || 0),
      exit_price_long: parseFloat(trade.exitPriceLong || trade.exit_price_long || 0),
      exit_price_short: parseFloat(trade.exitPriceShort || trade.exit_price_short || 0),
      fees_entry: parseFloat(trade.feesEntry || trade.fees_entry || 0),
      fees_exit: parseFloat(trade.feesExit || trade.fees_exit || 0),
      fees_total: parseFloat(trade.feesTotal || trade.fees_total || 0),
    };
    
    trades.push(dbTrade);
  }
  
  console.log(`✅ Parsed ${trades.length} trades from CSV`);
  return trades;
}

/**
 * Import from JSON file (if you have one)
 */
async function importFromJSON(filePath) {
  console.log(`📂 Reading JSON file: ${filePath}`);
  
  const jsonContent = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(jsonContent);
  
  const trades = Array.isArray(data) ? data : [data];
  console.log(`✅ Parsed ${trades.length} trades from JSON`);
  
  return trades;
}

/**
 * Insert trades into Supabase
 */
async function insertTrades(trades) {
  if (trades.length === 0) {
    console.log('⚠️ No trades to import');
    return;
  }
  
  console.log(`\n📤 Uploading ${trades.length} trades to Supabase...`);
  
  const { data, error } = await supabase
    .from('trades')
    .insert(trades)
    .select();
  
  if (error) {
    console.error('❌ Failed to insert trades:', error.message);
    return;
  }
  
  console.log(`✅ Successfully imported ${data.length} trades!`);
  
  // Show summary
  const totalPnl = trades.reduce((sum, t) => sum + (t.realized_pnl_usd - t.fees_total), 0);
  const winningTrades = trades.filter(t => (t.realized_pnl_usd - t.fees_total) > 0).length;
  
  console.log('\n📊 Import Summary:');
  console.log(`   Total Trades: ${trades.length}`);
  console.log(`   Winning Trades: ${winningTrades}`);
  console.log(`   Losing Trades: ${trades.length - winningTrades}`);
  console.log(`   Net P&L: $${totalPnl.toFixed(2)}`);
}

/**
 * Main function
 */
async function main() {
  console.log('🔄 Historical Trade Importer\n');
  
  // Option 1: Import from CSV file
  const csvPath = './historical-trades.csv';
  if (fs.existsSync(csvPath)) {
    console.log('✅ Found historical-trades.csv');
    const trades = await importFromCSV(csvPath);
    await insertTrades(trades);
    return;
  }
  
  // Option 2: Import from JSON file
  const jsonPath = './historical-trades.json';
  if (fs.existsSync(jsonPath)) {
    console.log('✅ Found historical-trades.json');
    const trades = await importFromJSON(jsonPath);
    await insertTrades(trades);
    return;
  }
  
  // Option 3: Use hardcoded trades
  if (historicalTrades.length > 0) {
    console.log('✅ Using hardcoded trades from script');
    await insertTrades(historicalTrades);
    return;
  }
  
  // No data found
  console.log('❌ No historical trade data found\n');
  console.log('To import trades, create one of these files:');
  console.log('  1. historical-trades.csv');
  console.log('  2. historical-trades.json');
  console.log('  3. Edit the historicalTrades array in this script\n');
  console.log('Example CSV format:');
  console.log('trade_id,entry_timestamp,exit_timestamp,entry_gap_usd,exit_gap_usd,...\n');
  console.log('Example JSON format:');
  console.log('[{ "trade_id": "001", "entry_timestamp": "2024-01-01T10:00:00Z", ... }]');
}

main().catch(console.error);
