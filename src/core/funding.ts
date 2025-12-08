/**
 * Funding rate logic for cross-exchange basis trading.
 * Computes net funding costs/earnings and determines if a trade is funding-favorable.
 */

import { IExchange } from '../exchanges/interface';
import { Logger } from '../utils/logger';

export interface NetFunding {
  netFundingPerHour: number;
  longExchange: string;
  shortExchange: string;
  longFundingRate: number;
  shortFundingRate: number;
  isFavorable: boolean;
}

export class FundingManager {
  private logger: Logger;
  
  constructor(logger: Logger) {
    this.logger = logger;
  }
  
  /**
   * Calculate net funding for a potential trade.
   * 
   * When LONG on one exchange, we PAY funding if rate is positive.
   * When SHORT on one exchange, we RECEIVE funding if rate is positive.
   * 
   * Net funding = fundingReceivedOnShort - fundingPaidOnLong
   * 
   * Positive net funding = we earn funding
   * Negative net funding = we pay funding
   */
  async calculateNetFunding(
    symbol: string,
    longExchange: IExchange,
    shortExchange: IExchange,
    maxNetFundingThreshold: number
  ): Promise<NetFunding> {
    // Fetch funding rates from both exchanges
    const [longFundingData, shortFundingData] = await Promise.all([
      longExchange.getFundingRate(symbol),
      shortExchange.getFundingRate(symbol)
    ]);
    
    const longFundingRate = longFundingData.rate; // per hour
    const shortFundingRate = shortFundingData.rate; // per hour
    
    // When we're LONG: we pay if rate is positive, receive if negative
    // When we're SHORT: we receive if rate is positive, pay if negative
    const fundingPaidOnLong = longFundingRate;
    const fundingReceivedOnShort = shortFundingRate;
    
    const netFundingPerHour = fundingReceivedOnShort - fundingPaidOnLong;
    
    // Check if funding is favorable (better than threshold)
    const isFavorable = netFundingPerHour >= maxNetFundingThreshold;
    
    this.logger.debug(
      `Funding check: LONG ${longExchange.name} (${(longFundingRate * 100).toFixed(4)}%/hr), ` +
      `SHORT ${shortExchange.name} (${(shortFundingRate * 100).toFixed(4)}%/hr), ` +
      `Net: ${(netFundingPerHour * 100).toFixed(4)}%/hr, ` +
      `Threshold: ${(maxNetFundingThreshold * 100).toFixed(4)}%/hr, ` +
      `Favorable: ${isFavorable}`
    );
    
    return {
      netFundingPerHour,
      longExchange: longExchange.name,
      shortExchange: shortExchange.name,
      longFundingRate,
      shortFundingRate,
      isFavorable
    };
  }
  
  /**
   * Determine which direction (Nado long vs Lighter long) has better funding.
   * Returns the recommended configuration.
   */
  async determineBestFundingDirection(
    symbol: string,
    nadoExchange: IExchange,
    lighterExchange: IExchange,
    maxNetFundingThreshold: number
  ): Promise<{
    cheapExchange: 'nado' | 'lighter';
    expensiveExchange: 'nado' | 'lighter';
    netFunding: NetFunding;
  } | null> {
    // Option 1: LONG Nado, SHORT Lighter
    const option1 = await this.calculateNetFunding(
      symbol,
      nadoExchange,
      lighterExchange,
      maxNetFundingThreshold
    );
    
    // Option 2: LONG Lighter, SHORT Nado
    const option2 = await this.calculateNetFunding(
      symbol,
      lighterExchange,
      nadoExchange,
      maxNetFundingThreshold
    );
    
    // Choose the option with better net funding
    if (option1.isFavorable && option2.isFavorable) {
      // Both are favorable, choose the better one
      if (option1.netFundingPerHour >= option2.netFundingPerHour) {
        return {
          cheapExchange: 'nado',
          expensiveExchange: 'lighter',
          netFunding: option1
        };
      } else {
        return {
          cheapExchange: 'lighter',
          expensiveExchange: 'nado',
          netFunding: option2
        };
      }
    } else if (option1.isFavorable) {
      return {
        cheapExchange: 'nado',
        expensiveExchange: 'lighter',
        netFunding: option1
      };
    } else if (option2.isFavorable) {
      return {
        cheapExchange: 'lighter',
        expensiveExchange: 'nado',
        netFunding: option2
      };
    }
    
    // Neither is favorable
    this.logger.warn(
      `Neither funding direction is favorable. ` +
      `Option 1 (LONG Nado): ${(option1.netFundingPerHour * 100).toFixed(4)}%/hr, ` +
      `Option 2 (LONG Lighter): ${(option2.netFundingPerHour * 100).toFixed(4)}%/hr, ` +
      `Threshold: ${(maxNetFundingThreshold * 100).toFixed(4)}%/hr`
    );
    
    return null;
  }
  
  /**
   * Estimate total funding cost/earnings for a given hold duration.
   */
  estimateFundingCost(
    netFundingPerHour: number,
    positionSizeBtc: number,
    holdDurationHours: number,
    averagePriceUsd: number
  ): number {
    // Funding is typically based on notional value
    const notionalValue = positionSizeBtc * averagePriceUsd;
    const fundingCostUsd = notionalValue * netFundingPerHour * holdDurationHours;
    return fundingCostUsd;
  }
  
  /**
   * Check current funding and log a warning if it's become unfavorable.
   */
  async monitorFunding(
    symbol: string,
    longExchange: IExchange,
    shortExchange: IExchange,
    maxNetFundingThreshold: number
  ): Promise<void> {
    try {
      const netFunding = await this.calculateNetFunding(
        symbol,
        longExchange,
        shortExchange,
        maxNetFundingThreshold
      );
      
      if (!netFunding.isFavorable) {
        this.logger.warn(
          `FUNDING ALERT: Current net funding (${(netFunding.netFundingPerHour * 100).toFixed(4)}%/hr) ` +
          `is worse than threshold (${(maxNetFundingThreshold * 100).toFixed(4)}%/hr)`
        );
      } else if (netFunding.netFundingPerHour > 0) {
        this.logger.info(
          `Funding favorable: earning ${(netFunding.netFundingPerHour * 100).toFixed(4)}%/hr`
        );
      }
    } catch (error) {
      this.logger.error(`Failed to monitor funding: ${error}`);
    }
  }
}

