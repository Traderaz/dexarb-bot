#!/usr/bin/env node
/**
 * Analyze price gaps from bot logs
 */

const fs = require('fs');

const logs = fs.readFileSync('bot-combined.log', 'utf8');
const lines = logs.split('\n');
const cutoffDate = new Date('2026-01-04T21:00:00');

console.log('Analyzing gaps since:', cutoffDate.toLocaleString());
console.log('');

let gaps = [];

for (const line of lines) {
  if (line.includes('Current Gap:')) {
    const timestamp = line.substring(0, 23);
    try {
      const logDate = new Date(timestamp);
      if (logDate >= cutoffDate) {
        const match = line.match(/Gap:\s*([0-9.]+)\s*USD.*lighter:\s*\$([0-9.]+).*nado:\s*\$([0-9.]+)/i);
        if (match) {
          gaps.push({
            time: timestamp,
            gap: parseFloat(match[1]),
            lighter: parseFloat(match[2]),
            nado: parseFloat(match[3])
          });
        }
      }
    } catch(e) {}
  }
}

if (gaps.length === 0) {
  console.log('No gap data found');
  process.exit(0);
}

gaps.sort((a, b) => a.gap - b.gap);
const lowest = gaps[0];
const highest = gaps[gaps.length - 1];
const avgGap = gaps.reduce((s, g) => s + g.gap, 0) / gaps.length;
const aboveThreshold = gaps.filter(g => g.gap >= 100).length;

console.log('═'.repeat(70));
console.log('📊 PRICE GAP ANALYSIS SINCE 9PM LAST NIGHT');
console.log('═'.repeat(70));
console.log('');

console.log('🔻 LOWEST GAP: $' + lowest.gap.toFixed(2) + ' USD');
console.log('   Time:    ' + lowest.time);
console.log('   Lighter: $' + lowest.lighter.toFixed(2));
console.log('   Nado:    $' + lowest.nado.toFixed(2));
console.log('   Status:  Prices were nearly equal');
console.log('');

console.log('🔺 HIGHEST GAP: $' + highest.gap.toFixed(2) + ' USD');
console.log('   Time:    ' + highest.time);
console.log('   Lighter: $' + highest.lighter.toFixed(2));
console.log('   Nado:    $' + highest.nado.toFixed(2));
console.log('   Status:  ' + (highest.nado > highest.lighter ? 'Nado was higher ⬆️' : 'Lighter was higher ⬆️'));
console.log('');

console.log('📈 STATISTICS');
console.log('   Total measurements:     ' + gaps.length.toLocaleString());
console.log('   Average gap:            $' + avgGap.toFixed(2));
console.log('   Entry threshold:        $100.00');
console.log('   Times above threshold:  ' + aboveThreshold + ' (' + ((aboveThreshold/gaps.length)*100).toFixed(1) + '%)');
console.log('');

// Show distribution
const ranges = [
  { min: 0, max: 25, label: '$0-25' },
  { min: 25, max: 50, label: '$25-50' },
  { min: 50, max: 75, label: '$50-75' },
  { min: 75, max: 100, label: '$75-100' },
  { min: 100, max: 150, label: '$100-150 (Entry zone)' },
  { min: 150, max: 200, label: '$150-200' }
];

console.log('📊 GAP DISTRIBUTION');
ranges.forEach(range => {
  const count = gaps.filter(g => g.gap >= range.min && g.gap < range.max).length;
  const pct = ((count / gaps.length) * 100).toFixed(1);
  const bar = '█'.repeat(Math.floor(pct / 2));
  console.log(`   ${range.label.padEnd(25)} ${count.toString().padStart(5)} (${pct.padStart(5)}%) ${bar}`);
});

console.log('');
console.log('═'.repeat(70));
console.log('⏰ ' + new Date().toLocaleString());
console.log('');

