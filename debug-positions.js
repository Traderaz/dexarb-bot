/**
 * Debug script to see raw position data
 */

require('dotenv').config();
const { NadoExchange } = require('./dist/exchanges/nado.js');
const { LighterExchange } = require('./dist/exchanges/lighter.js');
const { createLogger } = require('./dist/utils/logger.js');
const config = require('./config.json');

async function main() {
  console.log('🔍 Debugging Position Data...\n');

  const logger = createLogger('info');

  // Initialize exchanges
  console.log('Initializing exchanges...');
  const nadoExchange = new NadoExchange(config.nado, logger, false);
  const lighterExchange = new LighterExchange(config.lighter, logger, false);
  
  await nadoExchange.initialize();
  await lighterExchange.initialize();

  console.log('\n' + '='.repeat(60));
  console.log('🔷 LIGHTER - Raw Data');
  console.log('='.repeat(60));
  
  try {
    const lighterPos = await lighterExchange.getPosition('BTC-PERP');
    console.log('Position object:', JSON.stringify(lighterPos, null, 2));
    
    if (lighterPos) {
      console.log('\nParsed:');
      console.log('  Size:', lighterPos.size);
      console.log('  Absolute size:', Math.abs(lighterPos.size));
      console.log('  Side:', lighterPos.side);
      console.log('  Entry Price:', lighterPos.entryPrice);
      console.log('  Passes 0.0001 filter?', Math.abs(lighterPos.size) > 0.0001);
    }
  } catch (error) {
    console.log('Error:', error.message);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🟣 NADO - Raw Data');
  console.log('='.repeat(60));
  
  try {
    const nadoPos = await nadoExchange.getPosition('BTC-PERP');
    console.log('Position object:', JSON.stringify(nadoPos, null, 2));
    
    if (nadoPos) {
      console.log('\nParsed:');
      console.log('  Size:', nadoPos.size);
      console.log('  Absolute size:', Math.abs(nadoPos.size));
      console.log('  Side:', nadoPos.side);
      console.log('  Entry Price:', nadoPos.entryPrice);
      console.log('  Passes 0.0001 filter?', Math.abs(nadoPos.size) > 0.0001);
    } else {
      console.log('Position is null or undefined');
    }
  } catch (error) {
    console.log('Error:', error.message);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🔍 NADO - All Open Positions');
  console.log('='.repeat(60));
  
  try {
    const allNadoPos = await nadoExchange.getOpenPositions();
    console.log('Total positions:', allNadoPos.length);
    console.log('All positions:', JSON.stringify(allNadoPos, null, 2));
  } catch (error) {
    console.log('Error:', error.message);
  }

  console.log('');
}

main().catch(console.error);

