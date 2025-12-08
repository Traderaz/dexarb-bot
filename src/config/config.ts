/**
 * Configuration loading and validation.
 */

import * as fs from 'fs';
import * as path from 'path';
import { BotConfig } from './types';

export function loadConfig(configPath?: string): BotConfig {
  const defaultPath = path.join(process.cwd(), 'config.json');
  const finalPath = configPath || defaultPath;

  if (!fs.existsSync(finalPath)) {
    throw new Error(`Config file not found at: ${finalPath}`);
  }

  const configData = fs.readFileSync(finalPath, 'utf-8');
  const config: BotConfig = JSON.parse(configData);

  validateConfig(config);
  return config;
}

function validateConfig(config: BotConfig): void {
  // Trading parameters validation
  if (config.entryGapUsd <= 0) {
    throw new Error('entryGapUsd must be positive');
  }
  if (config.exitGapUsd < 0) {
    throw new Error('exitGapUsd must be non-negative');
  }
  if (config.exitGapUsd >= config.entryGapUsd) {
    throw new Error('exitGapUsd must be less than entryGapUsd');
  }
  if (config.positionSizeBtc <= 0) {
    throw new Error('positionSizeBtc must be positive');
  }
  if (config.minHoldDurationSeconds < 0) {
    throw new Error('minHoldDurationSeconds must be non-negative');
  }
  if (config.maxHoldDurationSeconds !== null && 
      config.maxHoldDurationSeconds !== undefined &&
      config.maxHoldDurationSeconds < config.minHoldDurationSeconds) {
    throw new Error('maxHoldDurationSeconds must be >= minHoldDurationSeconds');
  }
  if (config.entryTimeoutMs <= 0) {
    throw new Error('entryTimeoutMs must be positive');
  }
  if (config.exitTimeoutMs <= 0) {
    throw new Error('exitTimeoutMs must be positive');
  }

  // Exchange config validation
  if (!config.nado || !config.lighter) {
    throw new Error('Both nado and lighter exchange configs are required');
  }

  validateExchangeConfig(config.nado, 'nado');
  validateExchangeConfig(config.lighter, 'lighter');

  // Fee config validation
  if (!config.fees) {
    throw new Error('Fee configuration is required');
  }
  if (config.fees.nadoMakerFeeBps < 0 || config.fees.nadoTakerFeeBps < 0 ||
      config.fees.lighterMakerFeeBps < 0 || config.fees.lighterTakerFeeBps < 0) {
    throw new Error('Fee basis points must be non-negative');
  }

  // Risk config validation
  if (!config.risk) {
    throw new Error('Risk configuration is required');
  }
  if (config.risk.maxLeverage <= 0) {
    throw new Error('maxLeverage must be positive');
  }
  if (config.risk.minMarginBufferPercent < 0) {
    throw new Error('minMarginBufferPercent must be non-negative');
  }
}

function validateExchangeConfig(exchangeConfig: any, name: string): void {
  if (!exchangeConfig.restApiUrl) {
    throw new Error(`${name}: restApiUrl is required`);
  }
  if (!exchangeConfig.wsUrl) {
    throw new Error(`${name}: wsUrl is required for WebSocket-only mode. Add the WebSocket URL to config.json`);
  }
  if (!exchangeConfig.apiKey) {
    throw new Error(`${name}: apiKey is required`);
  }
  if (!exchangeConfig.apiSecret) {
    throw new Error(`${name}: apiSecret is required`);
  }
}

