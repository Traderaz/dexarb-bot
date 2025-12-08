/**
 * Main entry point for the BTC perpetual cross-exchange basis trading bot.
 * 
 * This bot trades BTC perpetual markets on Nado and Lighter (Mantle network).
 * It opens hedged spread trades when price gaps are large and closes when gaps compress.
 * 
 * Usage:
 *   npm install
 *   npm run build
 *   npm start
 * 
 * Or for development:
 *   npm run dev
 */

import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

import { loadConfig } from './config/config';
import { createLogger } from './utils/logger';
import { NadoExchange } from './exchanges/nado';
import { LighterExchange } from './exchanges/lighter';
import { BasisTradingStrategy } from './core/strategy';
import { sleep } from './utils/retry';

const SYMBOL = 'BTC-PERP';

class TradingBot {
  private config: ReturnType<typeof loadConfig>;
  private logger: ReturnType<typeof createLogger>;
  private nadoExchange!: NadoExchange;
  private lighterExchange!: LighterExchange;
  private strategy!: BasisTradingStrategy;
  private isRunning: boolean = false;
  private shouldStop: boolean = false;
  
  constructor() {
    // Load configuration
    this.config = loadConfig();
    this.logger = createLogger(this.config.logLevel);
    
    this.logger.info('='.repeat(80));
    this.logger.info('BTC Perpetual Cross-Exchange Basis Trading Bot');
    this.logger.info('='.repeat(80));
    this.logger.info(`Mode: ${this.config.dryRun ? 'DRY RUN (SIMULATION)' : 'LIVE TRADING'}`);
    this.logger.info(`Entry Gap: ${this.config.entryGapUsd} USD`);
    this.logger.info(`Exit Gap: ${this.config.exitGapUsd} USD`);
    this.logger.info(`Position Size: ${this.config.positionSizeBtc} BTC`);
    this.logger.info(`Min Hold Duration: ${this.config.minHoldDurationSeconds}s`);
    if (this.config.maxHoldDurationSeconds) {
      this.logger.info(`Max Hold Duration: ${this.config.maxHoldDurationSeconds}s`);
    }
    this.logger.info(`Max Net Funding Threshold: ${(this.config.maxNetFundingPerHourThreshold * 100).toFixed(4)}%/hr`);
    this.logger.info('='.repeat(80));
  }
  
  async initialize(): Promise<void> {
    this.logger.info('Initializing bot...');
    
    try {
      // Initialize exchanges
      this.nadoExchange = new NadoExchange(
        this.config.nado,
        this.logger,
        this.config.dryRun
      );
      
      this.lighterExchange = new LighterExchange(
        this.config.lighter,
        this.logger,
        this.config.dryRun
      );
      
      await Promise.all([
        this.nadoExchange.initialize(),
        this.lighterExchange.initialize()
      ]);
      
      this.logger.info('✓ Exchanges initialized');
      
      // Initialize strategy
      this.strategy = new BasisTradingStrategy(
        this.config,
        this.nadoExchange,
        this.lighterExchange,
        this.logger,
        SYMBOL
      );
      
      // IMPORTANT: Check for existing positions before trading
      await this.strategy.initialize();
      
      this.logger.info('✓ Strategy initialized');
      
      // Subscribe to market data if WebSocket is available
      if (this.config.nado.wsUrl) {
        await this.nadoExchange.subscribeToMarketData(SYMBOL, () => {
          // WebSocket callback - trigger strategy evaluation
          if (this.isRunning) {
            this.strategy.onMarketUpdate().catch(err => {
              this.logger.error(`Strategy update error (Nado WS): ${err}`);
            });
          }
        });
      }
      
      if (this.config.lighter.wsUrl) {
        await this.lighterExchange.subscribeToMarketData(SYMBOL, () => {
          // WebSocket callback - trigger strategy evaluation
          if (this.isRunning) {
            this.strategy.onMarketUpdate().catch(err => {
              this.logger.error(`Strategy update error (Lighter WS): ${err}`);
            });
          }
        });
      }
      
      this.logger.info('✓ Market data subscriptions active');
      this.logger.info('Bot initialization complete');
      
    } catch (error) {
      this.logger.error(`Failed to initialize bot: ${error}`);
      throw error;
    }
  }
  
  async start(): Promise<void> {
    this.logger.info('Starting trading bot...');
    this.isRunning = true;
    
    // Setup graceful shutdown
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    
    // Main event loop
    let lastMarketUpdateTime = 0;
    let lastStatusLogTime = 0;
    let lastFundingCheckTime = 0;
    
    while (!this.shouldStop) {
      try {
        const now = Date.now();
        
        // Periodic market update (if not using WebSocket)
        if (now - lastMarketUpdateTime >= this.config.marketDataUpdateIntervalMs) {
          lastMarketUpdateTime = now;
          await this.strategy.onMarketUpdate();
        }
        
        // Periodic status logging
        if (now - lastStatusLogTime >= 60000) { // Every 60 seconds
          lastStatusLogTime = now;
          this.strategy.logStatus();
        }
        
        // Periodic funding rate monitoring
        if (now - lastFundingCheckTime >= this.config.fundingRateUpdateIntervalMs) {
          lastFundingCheckTime = now;
          await this.monitorFundingRates();
        }
        
        // Sleep to prevent tight loop
        await sleep(1000);
        
      } catch (error) {
        this.logger.error(`Error in main loop: ${error}`);
        await sleep(5000); // Longer sleep on error
      }
    }
    
    this.logger.info('Bot stopped');
  }
  
  private async monitorFundingRates(): Promise<void> {
    try {
      const position = this.strategy.getStatus().position;
      
      if (position) {
        // Monitor funding for current position
        const longExchange = position.cheapExchange === 'nado' ? this.nadoExchange : this.lighterExchange;
        const shortExchange = position.expensiveExchange === 'nado' ? this.nadoExchange : this.lighterExchange;
        
        const [longFunding, shortFunding] = await Promise.all([
          longExchange.getFundingRate(SYMBOL),
          shortExchange.getFundingRate(SYMBOL)
        ]);
        
        const netFundingPerHour = shortFunding.rate - longFunding.rate;
        
        this.logger.debug(
          `Funding rates - LONG ${longExchange.name}: ${(longFunding.rate * 100).toFixed(4)}%/hr, ` +
          `SHORT ${shortExchange.name}: ${(shortFunding.rate * 100).toFixed(4)}%/hr, ` +
          `Net: ${(netFundingPerHour * 100).toFixed(4)}%/hr`
        );
        
        if (netFundingPerHour < this.config.maxNetFundingPerHourThreshold) {
          this.logger.warn(
            `⚠ Funding now unfavorable: ${(netFundingPerHour * 100).toFixed(4)}%/hr ` +
            `(threshold: ${(this.config.maxNetFundingPerHourThreshold * 100).toFixed(4)}%/hr)`
          );
        }
      }
    } catch (error) {
      this.logger.error(`Failed to monitor funding rates: ${error}`);
    }
  }
  
  private async gracefulShutdown(signal: string): Promise<void> {
    this.logger.info(`\nReceived ${signal}, shutting down gracefully...`);
    this.shouldStop = true;
    this.isRunning = false;
    
    try {
      const status = this.strategy.getStatus();
      
      if (status.state === 'OPEN') {
        this.logger.warn('⚠ Open position detected during shutdown');
        this.logger.warn('Position will remain open. To close it:');
        this.logger.warn('1. Restart the bot - it will manage the exit');
        this.logger.warn('2. Or manually close positions on both exchanges');
        
        const position = status.position;
        if (position) {
          this.logger.info(
            `Current position: LONG ${position.positionSizeBtc} on ${position.cheapExchange}, ` +
            `SHORT ${position.positionSizeBtc} on ${position.expensiveExchange}`
          );
        }
        
        // Optionally, we could force close here if user wants
        // For production safety, we leave positions open for manual intervention
      }
      
      // Print final stats
      this.logger.info('='.repeat(80));
      this.logger.info('Final Statistics:');
      const stats = status.stats;
      this.logger.info(`Total Trades: ${stats.totalTrades}`);
      if (stats.totalTrades > 0) {
        this.logger.info(`Total PnL: ${stats.totalPnl.toFixed(6)} BTC`);
        this.logger.info(`Average Hold Duration: ${stats.averageHoldDuration.toFixed(0)}s`);
        this.logger.info(`Win Rate: ${(stats.winRate * 100).toFixed(1)}%`);
      }
      this.logger.info('='.repeat(80));
      
      // Close exchange connections
      await Promise.all([
        this.nadoExchange.close(),
        this.lighterExchange.close()
      ]);
      
      this.logger.info('Shutdown complete');
      process.exit(0);
      
    } catch (error) {
      this.logger.error(`Error during shutdown: ${error}`);
      process.exit(1);
    }
  }
}

// Main execution
async function main() {
  const bot = new TradingBot();
  
  try {
    await bot.initialize();
    await bot.start();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run the bot
if (require.main === module) {
  main();
}

export { TradingBot };

