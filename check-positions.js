#!/usr/bin/env node
/**
 * Quick Position Checker
 * Run this to instantly see your current positions on both exchanges
 */

const { getPositions, getMarketData, getHedgingStatus } = require('./api-monitoring-v2.js');

async function main() {
  console.log('');
  console.log('═'.repeat(60));
  console.log('📊 POSITION CHECK');
  console.log('═'.repeat(60));
  console.log('');

  // Get positions
  console.log('⏳ Fetching positions...\n');
  const positions = await getPositions();
  const marketData = await getMarketData();
  const hedging = await getHedgingStatus();

  // Display Lighter
  console.log('🔷 LIGHTER (Mantle)');
  console.log('─'.repeat(60));
  if (positions.lighter.error) {
    console.log(`  ❌ Error: ${positions.lighter.error}`);
  } else if (positions.lighter.position?.status === 'FLAT') {
    console.log('  Status: FLAT (no position)');
  } else if (positions.lighter.position) {
    const pos = positions.lighter.position;
    const pnlColor = pos.unrealizedPnl >= 0 ? '🟢' : '🔴';
    console.log(`  Status: ${pos.side}`);
    console.log(`  Size: ${Math.abs(pos.size)} BTC`);
    console.log(`  Entry: $${pos.entryPrice.toFixed(2)}`);
    console.log(`  Mark: $${pos.markPrice.toFixed(2)}`);
    console.log(`  ${pnlColor} Unrealized PnL: $${pos.unrealizedPnl.toFixed(2)}`);
  }
  
  if (marketData.lighter.data) {
    console.log(`  Current: Bid $${marketData.lighter.data.bid.toFixed(2)} | Ask $${marketData.lighter.data.ask.toFixed(2)}`);
  }

  console.log('');

  // Display Nado
  console.log('🟣 NADO');
  console.log('─'.repeat(60));
  if (positions.nado.error) {
    console.log(`  ❌ Error: ${positions.nado.error}`);
  } else if (positions.nado.position?.status === 'FLAT') {
    console.log('  Status: FLAT (no position)');
  } else if (positions.nado.position) {
    const pos = positions.nado.position;
    const pnlColor = pos.unrealizedPnl >= 0 ? '🟢' : '🔴';
    console.log(`  Status: ${pos.side}`);
    console.log(`  Size: ${Math.abs(pos.size)} BTC`);
    console.log(`  Entry: $${pos.entryPrice.toFixed(2)}`);
    console.log(`  Mark: $${pos.markPrice.toFixed(2)}`);
    console.log(`  ${pnlColor} Unrealized PnL: $${pos.unrealizedPnl.toFixed(2)}`);
  }
  
  if (marketData.nado.data) {
    console.log(`  Current: Bid $${marketData.nado.data.bid.toFixed(2)} | Ask $${marketData.nado.data.ask.toFixed(2)}`);
  }

  console.log('');

  // Display gap
  if (marketData.gap) {
    console.log('📈 PRICE GAP');
    console.log('─'.repeat(60));
    const gapColor = Math.abs(marketData.gap.absolute) > 100 ? '🟢' : '⚪';
    console.log(`  ${gapColor} Gap: $${marketData.gap.absolute.toFixed(2)} (${marketData.gap.bps.toFixed(1)} bps)`);
    console.log(`  Direction: ${marketData.gap.direction}`);
    console.log('');
  }

  // Display hedging status
  console.log('🛡️  HEDGING STATUS');
  console.log('─'.repeat(60));
  if (hedging.isHedged) {
    console.log(`  ✅ ${hedging.status}`);
  } else {
    console.log(`  ⚠️  ${hedging.status}`);
  }
  console.log(`  ${hedging.details}`);
  console.log('');

  // Display P&L with fees if position is open
  if (positions.pnl) {
    console.log('💰 P&L BREAKDOWN (Including Fees)');
    console.log('─'.repeat(60));
    console.log(`  Gross P&L: $${positions.pnl.grossUnrealized.toFixed(2)}`);
    console.log(`  Fees Paid (Entry): -$${positions.pnl.feesPaid.toFixed(2)}`);
    console.log(`  Est. Fees (Exit): -$${positions.pnl.estimatedExitFees.toFixed(2)}`);
    console.log(`  Total Fees: -$${positions.pnl.totalFees.toFixed(2)}`);
    console.log('  ────────────────────────');
    const netColor = positions.pnl.netUnrealized >= 0 ? '🟢' : '🔴';
    console.log(`  ${netColor} Net P&L: $${positions.pnl.netUnrealized.toFixed(2)}`);
    console.log('');
    console.log('  Breakdown:');
    console.log(`    Lighter P&L: $${positions.pnl.breakdown.lighterUnrealized.toFixed(2)}`);
    console.log(`    Lighter Fees: -$${positions.pnl.breakdown.lighterFees.toFixed(2)}`);
    console.log(`    Nado P&L: $${positions.pnl.breakdown.nadoUnrealized.toFixed(2)}`);
    console.log(`    Nado Fees: -$${positions.pnl.breakdown.nadoFees.toFixed(2)}`);
    console.log('');
  }
  
  console.log('═'.repeat(60));
  console.log(`⏰ ${new Date().toLocaleString()}`);
  console.log('');
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
