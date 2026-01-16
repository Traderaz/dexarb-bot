/**
 * Enhanced Monitoring API - Uses actual exchange classes for accurate data
 * Includes proper P&L calculations with fees
 */

require('dotenv').config();
const axios = require('axios');
const config = require('./config.json');

// Import exchange classes
const { NadoExchange } = require('./dist/exchanges/nado.js');
const { LighterExchange } = require('./dist/exchanges/lighter.js');
const { createLogger } = require('./dist/utils/logger.js');

// Initialize exchanges (singleton pattern)
let nadoExchange = null;
let lighterExchange = null;
let logger = null;

async function initializeExchanges() {
  if (!logger) {
    logger = createLogger('info');
  }
  
  if (!nadoExchange) {
    nadoExchange = new NadoExchange(config.nado, logger, false);
    await nadoExchange.initialize();
  }
  
  if (!lighterExchange) {
    lighterExchange = new LighterExchange(config.lighter, logger, false);
    await lighterExchange.initialize();
  }
}

/**
 * Calculate realized P&L including fees for a closed trade
 */
function calculateRealizedPnL(trade) {
  const {
    lighterEntryPrice,
    lighterExitPrice,
    nadoEntryPrice,
    nadoExitPrice,
    size
  } = trade;

  // Long Lighter, Short Nado
  const lighterPnl = (lighterExitPrice - lighterEntryPrice) * size;
  const nadoPnl = (nadoEntryPrice - nadoExitPrice) * size;
  
  // Calculate fees
  const lighterEntryFee = lighterEntryPrice * size * (config.fees.lighterTakerFeeBps / 10000);
  const lighterExitFee = lighterExitPrice * size * (config.fees.lighterTakerFeeBps / 10000);
  const nadoEntryFee = nadoEntryPrice * size * (config.fees.nadoMakerFeeBps / 10000);
  const nadoExitFee = nadoExitPrice * size * (config.fees.nadoMakerFeeBps / 10000);
  
  const totalFees = lighterEntryFee + lighterExitFee + nadoEntryFee + nadoExitFee;
  const grossPnl = lighterPnl + nadoPnl;
  const netPnl = grossPnl - totalFees;

  return {
    grossPnl,
    totalFees,
    netPnl,
    breakdown: {
      lighterPnl,
      nadoPnl,
      lighterFees: lighterEntryFee + lighterExitFee,
      nadoFees: nadoEntryFee + nadoExitFee
    }
  };
}

/**
 * Calculate unrealized P&L for current positions including fees already paid
 */
function calculateUnrealizedPnL(lighterPos, nadoPos, lighterMark, nadoMark) {
  if (!lighterPos || !nadoPos) return null;

  const size = Math.abs(lighterPos.size);
  
  // Unrealized P&L
  const lighterUnrealized = lighterPos.side === 'long'
    ? (lighterMark - lighterPos.entryPrice) * size
    : (lighterPos.entryPrice - lighterMark) * size;
    
  const nadoUnrealized = nadoPos.side === 'short'
    ? (nadoPos.entryPrice - nadoMark) * size
    : (nadoMark - nadoPos.entryPrice) * size;

  // Fees already paid on entry
  const lighterEntryFee = lighterPos.entryPrice * size * (config.fees.lighterTakerFeeBps / 10000);
  const nadoEntryFee = nadoPos.entryPrice * size * (config.fees.nadoMakerFeeBps / 10000);
  const feesPaid = lighterEntryFee + nadoEntryFee;

  // Estimated exit fees
  const lighterExitFee = lighterMark * size * (config.fees.lighterTakerFeeBps / 10000);
  const nadoExitFee = nadoMark * size * (config.fees.nadoMakerFeeBps / 10000);
  const estimatedExitFees = lighterExitFee + nadoExitFee;

  const grossUnrealized = lighterUnrealized + nadoUnrealized;
  const netUnrealized = grossUnrealized - feesPaid - estimatedExitFees;

  return {
    grossUnrealized,
    feesPaid,
    estimatedExitFees,
    totalFees: feesPaid + estimatedExitFees,
    netUnrealized,
    breakdown: {
      lighterUnrealized,
      nadoUnrealized,
      lighterFees: lighterEntryFee + lighterExitFee,
      nadoFees: nadoEntryFee + nadoExitFee
    }
  };
}

/**
 * Get current positions with accurate P&L including fees
 */
async function getPositions() {
  await initializeExchanges();

  const results = {
    lighter: { position: null, error: null },
    nado: { position: null, error: null },
    pnl: null,
    timestamp: new Date().toISOString()
  };

  try {
    // Get Lighter position
    const lighterPos = await lighterExchange.getPosition('BTC-PERP');
    
    if (lighterPos && Math.abs(lighterPos.size) > 0.0001) {
      results.lighter.position = {
        symbol: 'BTC-PERP',
        size: lighterPos.size,
        side: lighterPos.side.toUpperCase(),
        entryPrice: lighterPos.entryPrice,
        markPrice: lighterPos.markPrice,
        unrealizedPnl: lighterPos.unrealizedPnl
      };
    } else {
      results.lighter.position = { status: 'FLAT', size: 0 };
    }
  } catch (error) {
    results.lighter.error = error.message;
  }

  try {
    // Get Nado position
    const nadoPos = await nadoExchange.getPosition('BTC-PERP');
    
    if (nadoPos && Math.abs(nadoPos.size) > 0.0001) {
      results.nado.position = {
        symbol: 'BTC-PERP',
        size: nadoPos.size,
        side: nadoPos.side.toUpperCase(),
        entryPrice: nadoPos.entryPrice,
        markPrice: nadoPos.markPrice,
        unrealizedPnl: nadoPos.unrealizedPnl
      };
    } else {
      results.nado.position = { status: 'FLAT', size: 0 };
    }
  } catch (error) {
    results.nado.error = error.message;
  }

  // Calculate combined P&L with fees if both positions exist
  if (results.lighter.position?.size && results.nado.position?.size) {
    // Get current market data for accurate mark prices (Lighter's mark price can be stale)
    let lighterCurrentMid = results.lighter.position.markPrice;
    let nadoCurrentMid = results.nado.position.markPrice;
    
    try {
      const lighterMarket = await lighterExchange.getMarketData('BTC-PERP');
      lighterCurrentMid = lighterMarket.midPrice;
    } catch (error) {
      // Fallback to position mark price if market data fetch fails
    }
    
    try {
      const nadoMarket = await nadoExchange.getMarketData('BTC-PERP');
      nadoCurrentMid = nadoMarket.midPrice;
    } catch (error) {
      // Fallback to position mark price if market data fetch fails
    }
    
    results.pnl = calculateUnrealizedPnL(
      results.lighter.position,
      results.nado.position,
      lighterCurrentMid,
      nadoCurrentMid
    );
  }

  return results;
}

/**
 * Get current market data from both exchanges
 */
async function getMarketData() {
  await initializeExchanges();

  const results = {
    lighter: { data: null, error: null },
    nado: { data: null, error: null },
    gap: null,
    timestamp: new Date().toISOString()
  };

  try {
    const lighterData = await lighterExchange.getMarketData('BTC-PERP');
    results.lighter.data = {
      bid: lighterData.bidPrice,
      ask: lighterData.askPrice,
      mid: lighterData.midPrice,
      spread: lighterData.askPrice - lighterData.bidPrice
    };
  } catch (error) {
    results.lighter.error = error.message;
  }

  try {
    const nadoData = await nadoExchange.getMarketData('BTC-PERP');
    results.nado.data = {
      bid: nadoData.bidPrice,
      ask: nadoData.askPrice,
      mid: nadoData.midPrice,
      spread: nadoData.askPrice - nadoData.bidPrice
    };
  } catch (error) {
    results.nado.error = error.message;
  }

  // Calculate gap
  if (results.lighter.data && results.nado.data) {
    const lighterMid = results.lighter.data.mid;
    const nadoMid = results.nado.data.mid;
    
    results.gap = {
      absolute: nadoMid - lighterMid,
      percentage: ((nadoMid - lighterMid) / lighterMid) * 100,
      bps: ((nadoMid - lighterMid) / lighterMid) * 10000,
      direction: nadoMid > lighterMid ? 'NADO_HIGHER' : 'LIGHTER_HIGHER',
      entryThreshold: config.entryGapUsd,
      exitThreshold: config.exitGapUsd,
      canEnter: Math.abs(nadoMid - lighterMid) >= config.entryGapUsd,
      canExit: Math.abs(nadoMid - lighterMid) <= config.exitGapUsd
    };
  }

  return results;
}

/**
 * Get account balances
 */
async function getBalances() {
  await initializeExchanges();

  const results = {
    lighter: { balance: null, error: null },
    nado: { balance: null, error: null },
    timestamp: new Date().toISOString()
  };

  try {
    const lighterAccount = await lighterExchange.getAccountInfo();
    results.lighter.balance = {
      totalBalance: lighterAccount.balance || 0,
      availableBalance: lighterAccount.availableBalance || 0,
      availableMargin: lighterAccount.availableMargin || 0
    };
  } catch (error) {
    results.lighter.error = error.message;
  }

  try {
    const nadoAccount = await nadoExchange.getAccountInfo();
    results.nado.balance = {
      totalBalance: nadoAccount.balance || 0,
      availableMargin: nadoAccount.availableMargin || 0,
      usedMargin: nadoAccount.usedMargin || 0
    };
  } catch (error) {
    results.nado.error = error.message;
  }

  return results;
}

/**
 * Get hedging status
 */
async function getHedgingStatus() {
  const positions = await getPositions();
  
  const lighterPos = positions.lighter.position;
  const nadoPos = positions.nado.position;
  
  const status = {
    timestamp: new Date().toISOString(),
    isHedged: false,
    status: 'UNKNOWN',
    lighter: lighterPos,
    nado: nadoPos,
    pnl: positions.pnl,
    details: null
  };

  // Both flat
  if (lighterPos?.status === 'FLAT' && nadoPos?.status === 'FLAT') {
    status.isHedged = true;
    status.status = 'FLAT';
    status.details = 'No positions open on either exchange';
    return status;
  }

  // Check if hedged (opposite positions)
  if (lighterPos?.size && nadoPos?.size) {
    const sizeDiff = Math.abs(Math.abs(lighterPos.size) - Math.abs(nadoPos.size));
    const sidesOpposite = lighterPos.side !== nadoPos.side;
    
    if (sidesOpposite && sizeDiff < 0.001) {
      status.isHedged = true;
      status.status = 'HEDGED';
      const netPnl = positions.pnl?.netUnrealized || 0;
      const pnlEmoji = netPnl >= 0 ? '🟢' : '🔴';
      status.details = `Properly hedged: ${lighterPos.side} ${Math.abs(lighterPos.size)} on Lighter, ${nadoPos.side} ${Math.abs(nadoPos.size)} on Nado ${pnlEmoji} Net P&L: $${netPnl.toFixed(2)}`;
    } else if (!sidesOpposite) {
      status.isHedged = false;
      status.status = 'UNHEDGED_SAME_SIDE';
      status.details = `⚠️ RISK: Both positions are ${lighterPos.side}!`;
    } else {
      status.isHedged = false;
      status.status = 'UNHEDGED_SIZE_MISMATCH';
      status.details = `⚠️ Size mismatch: Lighter ${lighterPos.size}, Nado ${nadoPos.size}`;
    }
  } else if (lighterPos?.size || nadoPos?.size) {
    // One side only
    status.isHedged = false;
    status.status = 'UNHEDGED_ONE_SIDE';
    const exchange = lighterPos?.size ? 'Lighter' : 'Nado';
    const size = lighterPos?.size || nadoPos?.size;
    const side = lighterPos?.side || nadoPos?.side;
    status.details = `⚠️ Position only on ${exchange}: ${side} ${Math.abs(size)} BTC`;
  }

  return status;
}

/**
 * Parse bot logs for trading statistics
 */
function getTradingStats() {
  const logFilePath = require('path').join(__dirname, 'bot-combined.log');
  
  try {
    const fs = require('fs');
    if (!fs.existsSync(logFilePath)) {
      return { error: 'Log file not found' };
    }

    const logs = fs.readFileSync(logFilePath, 'utf8');
    const lines = logs.split('\n');

    const stats = {
      totalEntries: 0,
      totalExits: 0,
      successfulEntries: 0,
      failedEntries: 0,
      emergencyCloses: 0,
      lastEntry: null,
      lastExit: null,
      recentTrades: []
    };

    for (const line of lines) {
      if (line.includes('SPREAD OPENED') || line.includes('Position OPENED')) {
        stats.totalEntries++;
        stats.successfulEntries++;
        stats.lastEntry = line;
        
        const match = line.match(/Entry gap ([0-9.]+) USD.*LONG ([0-9.]+).*@ ([0-9.]+).*SHORT ([0-9.]+).*@ ([0-9.]+)/);
        if (match) {
          stats.recentTrades.push({
            type: 'ENTRY',
            timestamp: line.substring(0, 23),
            gap: parseFloat(match[1]),
            lighterSize: parseFloat(match[2]),
            lighterPrice: parseFloat(match[3]),
            nadoSize: parseFloat(match[4]),
            nadoPrice: parseFloat(match[5])
          });
        }
      }
      
      if (line.includes('SPREAD CLOSED') || line.includes('Position CLOSED')) {
        stats.totalExits++;
        stats.lastExit = line;
        
        const match = line.match(/Exit gap ([0-9.]+) USD/);
        if (match) {
          stats.recentTrades.push({
            type: 'EXIT',
            timestamp: line.substring(0, 23),
            gap: parseFloat(match[1])
          });
        }
      }
      
      if (line.includes('ENTRY INCOMPLETE') || line.includes('partial fill')) {
        stats.failedEntries++;
      }
      
      if (line.includes('Emergency close') || line.includes('emergency')) {
        stats.emergencyCloses++;
      }
    }

    stats.recentTrades = stats.recentTrades.slice(-10);
    return stats;
  } catch (error) {
    return { error: error.message };
  }
}

module.exports = {
  getPositions,
  getMarketData,
  getBalances,
  getHedgingStatus,
  getTradingStats,
  calculateRealizedPnL,
  calculateUnrealizedPnL
};

