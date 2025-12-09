/**
 * View trade history and statistics
 */

const fs = require('fs');
const path = require('path');

function viewTrades() {
  const tradesFile = path.join(__dirname, 'logs', 'trades.json');
  
  if (!fs.existsSync(tradesFile)) {
    console.log('No trade history found. Trades will be logged to logs/trades.json after the first completed trade.');
    return;
  }
  
  const trades = JSON.parse(fs.readFileSync(tradesFile, 'utf8'));
  
  if (trades.length === 0) {
    console.log('No trades completed yet.');
    return;
  }
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 TRADING HISTORY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  
  trades.forEach((trade, idx) => {
    const entryDate = new Date(trade.entryTimestamp).toLocaleString();
    const exitDate = new Date(trade.exitTimestamp).toLocaleString();
    const netPnl = trade.realizedPnlUsd - trade.fees.total;
    const profitable = netPnl > 0;
    
    console.log(`Trade #${idx + 1} ${profitable ? '🟢' : '🔴'}`);
    console.log('────────────────────────────────────────────────────────────');
    console.log(`  Entry: ${entryDate}`);
    console.log(`  Exit:  ${exitDate}`);
    console.log(`  Hold:  ${Math.floor(trade.holdDurationSeconds / 60)}m ${trade.holdDurationSeconds % 60}s`);
    console.log('');
    console.log(`  Entry Gap: $${trade.entryGapUsd.toFixed(2)}`);
    console.log(`  Exit Gap:  $${trade.exitGapUsd.toFixed(2)}`);
    console.log(`  Cheap Ex:  ${trade.cheapExchange}`);
    console.log(`  Exp. Ex:   ${trade.expensiveExchange}`);
    console.log('');
    console.log(`  Entry Prices: Cheap $${trade.entryPrices.cheap.toFixed(2)} | Expensive $${trade.entryPrices.expensive.toFixed(2)}`);
    console.log(`  Exit Prices:  Long $${trade.exitPrices.long.toFixed(2)} | Short $${trade.exitPrices.short.toFixed(2)}`);
    console.log('');
    console.log(`  Size: ${trade.positionSizeBtc} BTC`);
    console.log(`  Gross P&L: $${trade.realizedPnlUsd.toFixed(2)}`);
    console.log(`  Entry Fees: $${trade.fees.entry.toFixed(2)}`);
    console.log(`  Exit Fees: $${trade.fees.exit.toFixed(2)}`);
    console.log(`  Total Fees: $${trade.fees.total.toFixed(2)}`);
    console.log(`  ${profitable ? '🟢' : '🔴'} Net P&L: $${netPnl.toFixed(2)}`);
    console.log('');
  });
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📈 OVERALL STATISTICS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  
  const totalPnlUsd = trades.reduce((sum, t) => sum + t.realizedPnlUsd, 0);
  const totalFees = trades.reduce((sum, t) => sum + t.fees.total, 0);
  const netPnlUsd = totalPnlUsd - totalFees;
  const winningTrades = trades.filter(t => (t.realizedPnlUsd - t.fees.total) > 0).length;
  const losingTrades = trades.length - winningTrades;
  const winRate = (winningTrades / trades.length * 100).toFixed(1);
  const avgHoldDuration = trades.reduce((sum, t) => sum + t.holdDurationSeconds, 0) / trades.length;
  const avgPnlPerTrade = netPnlUsd / trades.length;
  
  console.log(`Total Trades: ${trades.length}`);
  console.log(`Winning Trades: ${winningTrades} (${winRate}%)`);
  console.log(`Losing Trades: ${losingTrades}`);
  console.log('');
  console.log(`Gross P&L: $${totalPnlUsd.toFixed(2)}`);
  console.log(`Total Fees: $${totalFees.toFixed(2)}`);
  console.log(`Net P&L: ${netPnlUsd >= 0 ? '🟢' : '🔴'} $${netPnlUsd.toFixed(2)}`);
  console.log('');
  console.log(`Avg Hold Duration: ${Math.floor(avgHoldDuration / 60)}m ${Math.floor(avgHoldDuration % 60)}s`);
  console.log(`Avg Net P&L per Trade: $${avgPnlPerTrade.toFixed(2)}`);
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
}

viewTrades();

