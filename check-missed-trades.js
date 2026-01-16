#!/usr/bin/env node
/**
 * Check why trades were not executed when gap exceeded threshold
 */

const fs = require('fs');

const logs = fs.readFileSync('bot-combined.log', 'utf8');
const lines = logs.split('\n');
const cutoffDate = new Date('2026-01-04T21:00:00');

console.log('Investigating missed trade opportunities since 9PM last night...');
console.log('');

// Find all gaps >= $100
let highGaps = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('Current Gap:')) {
    const timestamp = line.substring(0, 23);
    try {
      const logDate = new Date(timestamp);
      if (logDate >= cutoffDate) {
        const match = line.match(/Gap:\s*([0-9.]+)\s*USD/i);
        if (match && parseFloat(match[1]) >= 100) {
          // Get context (5 lines before and after)
          const context = {
            before: lines.slice(Math.max(0, i-5), i),
            current: line,
            after: lines.slice(i+1, i+6)
          };
          
          highGaps.push({
            time: timestamp,
            gap: parseFloat(match[1]),
            lineNum: i,
            context: context
          });
        }
      }
    } catch(e) {}
  }
}

console.log('═'.repeat(80));
console.log('Found ' + highGaps.length + ' instances where gap >= $100');
console.log('═'.repeat(80));
console.log('');

// Check for trade entries
const tradeEntries = lines.filter(l => 
  l.includes('SPREAD OPENED') || 
  l.includes('Position OPENED') ||
  l.includes('Entering trade') ||
  l.includes('Opening position')
).length;

const tradeAttempts = lines.filter(l => 
  l.includes('Attempting to open') ||
  l.includes('Entry conditions met') ||
  l.includes('Checking entry conditions')
).length;

console.log('📊 TRADE ACTIVITY:');
console.log('   Trade entries executed: ' + tradeEntries);
console.log('   Trade attempts logged: ' + tradeAttempts);
console.log('');

// Show each high gap instance with context
highGaps.forEach((g, idx) => {
  console.log('─'.repeat(80));
  console.log(`Instance ${idx + 1}: ${g.time} - Gap: $${g.gap.toFixed(2)}`);
  console.log('─'.repeat(80));
  
  // Check for specific messages in context
  const allContext = [...g.context.before, g.context.current, ...g.context.after];
  
  const hasEntryCheck = allContext.some(l => l.includes('Entry conditions') || l.includes('Checking entry'));
  const hasPositionOpen = allContext.some(l => l.includes('position') && l.includes('open'));
  const hasError = allContext.some(l => l.includes('ERROR') || l.includes('Failed'));
  const hasWarning = allContext.some(l => l.includes('WARN'));
  const hasDryRun = allContext.some(l => l.includes('DRY RUN'));
  
  console.log('Status checks:');
  console.log('  Entry check logged: ' + (hasEntryCheck ? '✓' : '✗'));
  console.log('  Position already open: ' + (hasPositionOpen ? '✓' : '✗'));
  console.log('  Error occurred: ' + (hasError ? '✓' : '✗'));
  console.log('  Warning present: ' + (hasWarning ? '✓' : '✗'));
  console.log('  Dry run mode: ' + (hasDryRun ? '✓' : '✗'));
  console.log('');
  
  // Show relevant context lines
  console.log('Context (5 lines before and after):');
  allContext.forEach(l => {
    if (l.trim()) {
      const shortLine = l.substring(0, 150);
      if (l.includes('ERROR') || l.includes('Failed')) {
        console.log('  ❌ ' + shortLine);
      } else if (l.includes('WARN')) {
        console.log('  ⚠️  ' + shortLine);
      } else if (l.includes('Entry') || l.includes('position')) {
        console.log('  📍 ' + shortLine);
      } else {
        console.log('     ' + shortLine);
      }
    }
  });
  console.log('');
});

console.log('═'.repeat(80));
console.log('');

// Check bot status
const botStarted = lines.filter(l => l.includes('Bot started') || l.includes('Strategy initialized')).length;
const botStopped = lines.filter(l => l.includes('Bot stopped') || l.includes('Shutting down')).length;

console.log('🤖 BOT STATUS:');
console.log('   Bot starts: ' + botStarted);
console.log('   Bot stops: ' + botStopped);
console.log('');

// Check config
try {
  const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
  console.log('⚙️  CONFIGURATION:');
  console.log('   Entry gap threshold: $' + config.entryGapUsd);
  console.log('   Max entry gap: $' + (config.maxEntryGapUsd || 'not set'));
  console.log('   Exit gap threshold: $' + config.exitGapUsd);
  console.log('   Position size: ' + config.positionSizeBtc + ' BTC');
  console.log('   Dry run mode: ' + config.dryRun);
  console.log('');
} catch(e) {
  console.log('Could not read config.json');
}

console.log('═'.repeat(80));

