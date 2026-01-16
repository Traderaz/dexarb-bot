import * as fs from 'fs';
import * as path from 'path';

export interface TradeLogEntry {
  timestamp: string;
  tradeId: string;
  action: 'ENTRY' | 'EXIT' | 'EMERGENCY_CLOSE' | 'UNHEDGED_CLOSE';
  
  // Entry details
  entryGapUsd?: number;
  lighterSide?: 'buy' | 'sell';
  nadoSide?: 'buy' | 'sell';
  
  // Execution details
  lighterOrderId?: string;
  lighterSize?: number;
  lighterPrice?: number;
  lighterFilled?: boolean;
  lighterFeeUsd?: number;
  
  nadoOrderId?: string;
  nadoSize?: number;
  nadoPrice?: number;
  nadoFilled?: boolean;
  nadoFeeUsd?: number;
  
  // Exit details
  exitGapUsd?: number;
  holdDurationSeconds?: number;
  
  // P&L
  grossPnlUsd?: number;
  totalFeesUsd?: number;
  netPnlUsd?: number;
  netPnlBtc?: number;
  
  // Status
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'UNHEDGED';
  notes?: string;
}

export class CsvTradeLogger {
  private logFilePath: string;
  private headers = [
    'Timestamp',
    'Trade ID',
    'Action',
    'Status',
    'Entry Gap USD',
    'Exit Gap USD',
    'Hold Duration (s)',
    'Lighter Side',
    'Lighter Order ID',
    'Lighter Size',
    'Lighter Price',
    'Lighter Filled',
    'Lighter Fee USD',
    'Nado Side',
    'Nado Order ID',
    'Nado Size',
    'Nado Price',
    'Nado Filled',
    'Nado Fee USD',
    'Gross P&L USD',
    'Total Fees USD',
    'Net P&L USD',
    'Net P&L BTC',
    'Notes'
  ];

  constructor(logDirectory: string = './logs') {
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logDirectory)) {
      fs.mkdirSync(logDirectory, { recursive: true });
    }

    // Create log file with date in filename
    const date = new Date().toISOString().split('T')[0];
    this.logFilePath = path.join(logDirectory, `trades-${date}.csv`);

    // Write headers if file doesn't exist
    if (!fs.existsSync(this.logFilePath)) {
      this.writeHeaders();
    }
  }

  private writeHeaders(): void {
    const headerLine = this.headers.join(',') + '\n';
    fs.writeFileSync(this.logFilePath, headerLine, 'utf8');
  }

  private escapeCSV(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    const str = String(value);
    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  public logTrade(entry: TradeLogEntry): void {
    const row = [
      this.escapeCSV(entry.timestamp),
      this.escapeCSV(entry.tradeId),
      this.escapeCSV(entry.action),
      this.escapeCSV(entry.status),
      this.escapeCSV(entry.entryGapUsd),
      this.escapeCSV(entry.exitGapUsd),
      this.escapeCSV(entry.holdDurationSeconds),
      this.escapeCSV(entry.lighterSide),
      this.escapeCSV(entry.lighterOrderId),
      this.escapeCSV(entry.lighterSize),
      this.escapeCSV(entry.lighterPrice),
      this.escapeCSV(entry.lighterFilled),
      this.escapeCSV(entry.lighterFeeUsd?.toFixed(2)),
      this.escapeCSV(entry.nadoSide),
      this.escapeCSV(entry.nadoOrderId),
      this.escapeCSV(entry.nadoSize),
      this.escapeCSV(entry.nadoPrice),
      this.escapeCSV(entry.nadoFilled),
      this.escapeCSV(entry.nadoFeeUsd?.toFixed(2)),
      this.escapeCSV(entry.grossPnlUsd?.toFixed(2)),
      this.escapeCSV(entry.totalFeesUsd?.toFixed(2)),
      this.escapeCSV(entry.netPnlUsd?.toFixed(2)),
      this.escapeCSV(entry.netPnlBtc?.toFixed(8)),
      this.escapeCSV(entry.notes)
    ];

    const line = row.join(',') + '\n';
    fs.appendFileSync(this.logFilePath, line, 'utf8');
  }

  public getLogFilePath(): string {
    return this.logFilePath;
  }
}

