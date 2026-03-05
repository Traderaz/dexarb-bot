/**
 * Parse trades from bot-combined.log and import to Supabase
 * Run: node parse-and-import-trades.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Parse all trades from log file
 */
function parseTradesFromLog(logFilePath) {
  console.log(`📂 Reading log file: ${logFilePath}`);
  
  const logContent = fs.readFileSync(logFilePath, 'utf8');
  const lines = logContent.split('\n');
  
  const trades = [];
  let currentTrade = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Look for trade logged message
    const tradeLogMatch = line.match(/📝 Trade logged: (trade-\d+)/);
    if (tradeLogMatch) {
      const tradeId = tradeLogMatch[1];
      const timestamp = line.substring(0, 23).trim();
      
      // Initialize trade object
      currentTrade = {
        trade_id: tradeId,
        entry_timestamp: null,
        exit_timestamp: new Date(timestamp).toISOString(),
        entry_gap_usd: 0,
        exit_gap_usd: 0,
        cheap_exchange: 'unknown',
        expensive_exchange: 'unknown',
        position_size_btc: 0.5, // Default from config
        realized_pnl_btc: 0,
        realized_pnl_usd: 0,
        hold_duration_seconds: 0,
        entry_price_cheap: 0,
        entry_price_expensive: 0,
        exit_price_long: 0,
        exit_price_short: 0,
        fees_entry: 0,
        fees_exit: 0,
        fees_total: 0,
      };
      
      // Parse next few lines for P&L, Fees, Hold
      if (i + 1 < lines.length) {
        const pnlLine = lines[i + 1];
        const pnlMatch = pnlLine.match(/P&L:\s*([-\d.]+)\s*BTC\s*\(\$\s*([-\d.]+)\)/);
        if (pnlMatch) {
          currentTrade.realized_pnl_btc = parseFloat(pnlMatch[1]);
          currentTrade.realized_pnl_usd = parseFloat(pnlMatch[2]);
        }
      }
      
      if (i + 2 < lines.length) {
        const feesLine = lines[i + 2];
        const feesMatch = feesLine.match(/Fees:\s*\$\s*([\d.]+)/);
        if (feesMatch) {
          currentTrade.fees_total = parseFloat(feesMatch[1]);
          currentTrade.fees_entry = currentTrade.fees_total / 2;
          currentTrade.fees_exit = currentTrade.fees_total / 2;
        }
      }
      
      if (i + 3 < lines.length) {
        const holdLine = lines[i + 3];
        const holdMatch = holdLine.match(/Hold:\s*(\d+)s/);
        if (holdMatch) {
          currentTrade.hold_duration_seconds = parseInt(holdMatch[1]);
        }
      }
      
      // Look for SPREAD CLOSED line for more details
      if (i + 4 < lines.length) {
        const closedLine = lines[i + 4];
        const closedMatch = closedLine.match(/✓ SPREAD CLOSED:.*Entry gap was\s*([\d.]+)\s*USD/);
        if (closedMatch) {
          currentTrade.entry_gap_usd = parseFloat(closedMatch[1]);
        }
        
        const exitGapMatch = closedLine.match(/Exit gap\s*([-\d.]+)\s*USD/);
        if (exitGapMatch) {
          currentTrade.exit_gap_usd = parseFloat(exitGapMatch[1]);
        }
      }
      
      // Look backwards for entry information (Long/Short exchanges)
      for (let j = Math.max(0, i - 50); j < i; j++) {
        const prevLine = lines[j];
        
        // Look for entry execution
        const entryMatch = prevLine.match(/ENTRY SUCCESS.*Long\s+(\w+).*Short\s+(\w+)/i);
        if (entryMatch) {
          currentTrade.cheap_exchange = entryMatch[1].toLowerCase();
          currentTrade.expensive_exchange = entryMatch[2].toLowerCase();
          
          const entryTime = prevLine.substring(0, 23).trim();
          currentTrade.entry_timestamp = new Date(entryTime).toISOString();
          break;
        }
        
        // Alternative pattern
        const altMatch = prevLine.match(/Long\s+(\w+).*Short\s+(\w+)/);
        if (altMatch && !currentTrade.cheap_exchange) {
          currentTrade.cheap_exchange = altMatch[1].toLowerCase();
          currentTrade.expensive_exchange = altMatch[2].toLowerCase();
        }
      }
      
      // Calculate entry timestamp from exit and hold duration if not found
      if (!currentTrade.entry_timestamp && currentTrade.exit_timestamp && currentTrade.hold_duration_seconds > 0) {
        const exitTime = new Date(currentTrade.exit_timestamp);
        const entryTime = new Date(exitTime.getTime() - (currentTrade.hold_duration_seconds * 1000));
        currentTrade.entry_timestamp = entryTime.toISOString();
      }
      
      // Estimate prices from gaps (rough approximation)
      if (currentTrade.entry_gap_usd > 0 && currentTrade.entry_timestamp) {
        // Use BTC price around $90,000 as estimate
        const btcPrice = 90000;
        currentTrade.entry_price_cheap = btcPrice;
        currentTrade.entry_price_expensive = btcPrice + currentTrade.entry_gap_usd;
        currentTrade.exit_price_long = btcPrice;
        currentTrade.exit_price_short = btcPrice + currentTrade.exit_gap_usd;
      }
      
      // Only add if we have minimum required data
      if (currentTrade.entry_timestamp && currentTrade.hold_duration_seconds > 0) {
        trades.push(currentTrade);
      }
      
      currentTrade = null;
    }
  }
  
  console.log(`✅ Parsed ${trades.length} trades from log file`);
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
  
  // Insert in batches of 100
  const batchSize = 100;
  let totalInserted = 0;
  
  for (let i = 0; i < trades.length; i += batchSize) {
    const batch = trades.slice(i, i + batchSize);
    
    const { data, error } = await supabase
      .from('trades')
      .insert(batch)
      .select();
    
    if (error) {
      console.error(`❌ Failed to insert batch ${i / batchSize + 1}:`, error.message);
      continue;
    }
    
    totalInserted += data.length;
    console.log(`   ✅ Batch ${i / batchSize + 1}: Inserted ${data.length} trades`);
  }
  
  console.log(`\n✅ Successfully imported ${totalInserted} trades!`);
  
  // Show summary
  const totalPnl = trades.reduce((sum, t) => sum + (t.realized_pnl_usd - t.fees_total), 0);
  const totalFees = trades.reduce((sum, t) => sum + t.fees_total, 0);
  const winningTrades = trades.filter(t => (t.realized_pnl_usd - t.fees_total) > 0).length;
  const avgHold = trades.reduce((sum, t) => sum + t.hold_duration_seconds, 0) / trades.length;
  
  console.log('\n📊 Import Summary:');
  console.log(`   Total Trades: ${trades.length}`);
  console.log(`   Winning Trades: ${winningTrades} (${(winningTrades / trades.length * 100).toFixed(1)}%)`);
  console.log(`   Losing Trades: ${trades.length - winningTrades}`);
  console.log(`   Total Fees Paid: $${totalFees.toFixed(2)}`);
  console.log(`   Net P&L: $${totalPnl.toFixed(2)}`);
  console.log(`   Avg Hold Duration: ${Math.floor(avgHold / 60)}m ${Math.floor(avgHold % 60)}s`);
  
  // Show best and worst trades
  const sortedByPnl = [...trades].sort((a, b) => 
    (b.realized_pnl_usd - b.fees_total) - (a.realized_pnl_usd - a.fees_total)
  );
  
  console.log('\n🏆 Best Trade:');
  const best = sortedByPnl[0];
  console.log(`   Net P&L: $${(best.realized_pnl_usd - best.fees_total).toFixed(2)}`);
  console.log(`   Entry Gap: $${best.entry_gap_usd.toFixed(2)}`);
  console.log(`   Hold: ${best.hold_duration_seconds}s`);
  
  console.log('\n📉 Worst Trade:');
  const worst = sortedByPnl[sortedByPnl.length - 1];
  console.log(`   Net P&L: $${(worst.realized_pnl_usd - worst.fees_total).toFixed(2)}`);
  console.log(`   Entry Gap: $${worst.entry_gap_usd.toFixed(2)}`);
  console.log(`   Hold: ${worst.hold_duration_seconds}s`);
}

/**
 * Main function
 */
async function main() {
  console.log('🔄 Historical Trade Parser & Importer\n');
  
  const logFilePath = './bot-combined.log';
  
  if (!fs.existsSync(logFilePath)) {
    console.error('❌ bot-combined.log not found');
    process.exit(1);
  }
  
  const trades = parseTradesFromLog(logFilePath);
  
  if (trades.length === 0) {
    console.log('❌ No trades found in log file');
    process.exit(1);
  }
  
  // Show sample trade
  console.log('\n📋 Sample Trade (first one):');
  console.log(JSON.stringify(trades[0], null, 2));
  
  // Ask for confirmation (skip for automation)
  console.log('\n⚠️  About to import trades to Supabase...');
  
  await insertTrades(trades);
  
  console.log('\n✅ Done! Check your Supabase dashboard to see the data.');
}

main().catch(console.error);
