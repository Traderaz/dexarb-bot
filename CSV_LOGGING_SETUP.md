# CSV Trade Logging Implementation

## Overview
Added comprehensive CSV logging to track all bot trading activity with detailed information about entries, exits, emergency closures, and unhedged positions.

## Features

### 1. **Automated CSV File Creation**
- New CSV file created daily: `logs/trades-YYYY-MM-DD.csv`
- Headers automatically written on first creation
- All subsequent trades appended to the same day's file

### 2. **What Gets Logged**

#### Entry Trades
- Timestamp
- Trade ID
- Entry gap (USD)
- Both exchange order details:
  - Side (buy/sell)
  - Order ID
  - Size (BTC)
  - Fill price
  - Fees paid
- Status (SUCCESS/FAILED/PARTIAL)
- Notes with price details

#### Exit Trades
- All entry information
- Exit gap (USD)
- Hold duration (seconds)
- Gross P&L (USD)
- Total fees (USD)
- Net P&L (USD and BTC)
- Final exit prices for both exchanges

#### Emergency Closures
- Logged when only one exchange fills during entry
- Includes which exchange filled and which didn't
- Marked as `EMERGENCY_CLOSE` action
- Status: `PARTIAL`

#### Unhedged Position Auto-Closures
- Logged when bot detects orphaned position
- Marked as `UNHEDGED_CLOSE` action
- Status: `UNHEDGED`
- Details of which position was closed

## CSV Column Structure

```
Timestamp, Trade ID, Action, Status, Entry Gap USD, Exit Gap USD, Hold Duration (s),
Lighter Side, Lighter Order ID, Lighter Size, Lighter Price, Lighter Filled, Lighter Fee USD,
Nado Side, Nado Order ID, Nado Size, Nado Price, Nado Filled, Nado Fee USD,
Gross P&L USD, Total Fees USD, Net P&L USD, Net P&L BTC, Notes
```

## Example CSV Output

```csv
Timestamp,Trade ID,Action,Status,Entry Gap USD,Exit Gap USD,Hold Duration (s),Lighter Side,Lighter Order ID,Lighter Size,Lighter Price,Lighter Filled,Lighter Fee USD,Nado Side,Nado Order ID,Nado Size,Nado Price,Nado Filled,Nado Fee USD,Gross P&L USD,Total Fees USD,Net P&L USD,Net P&L BTC,Notes
2026-01-12T10:30:15.123Z,trade-1736682615123,ENTRY,SUCCESS,105.50,,,"buy","order-lighter-123",0.5,90400.00,true,0.00,"sell","order-nado-456",0.5,90505.50,true,4.53,,,,,LONG lighter @ 90400.00, SHORT nado @ 90505.50
2026-01-12T10:45:30.456Z,trade-1736682615123,EXIT,SUCCESS,105.50,35.20,915,"sell","order-lighter-789",0.5,90450.00,true,0.00,"buy","order-nado-012",0.5,90415.20,true,3.17,70.30,7.70,62.60,0.00069220,"Entry: lighter @ 90400.00, nado @ 90505.50"
2026-01-12T11:00:00.789Z,emergency-1736683200789,EMERGENCY_CLOSE,PARTIAL,,,,,,,,false,0.00,"sell","",0.5,90500.00,true,3.17,,,,,"Emergency closure: Nado position only (Lighter failed to fill)"
```

## Files Modified

### New Files
- `src/utils/csv-logger.ts` - CSV logging utility class

### Modified Files
- `src/core/strategy.ts`
  - Added CSV logger initialization
  - Added CSV logging for entry trades
  - Added CSV logging for exit trades
  - Added CSV logging for emergency closures
  - Added CSV logging for unhedged position auto-closures

## Benefits

1. **Complete Trade History**: Every trade is permanently recorded with all details
2. **Easy Analysis**: CSV format can be opened in Excel, Google Sheets, or analyzed with scripts
3. **Audit Trail**: Full record of all bot actions for debugging and performance analysis
4. **Fee Tracking**: Detailed fee information for accurate P&L accounting
5. **Problem Detection**: Emergency and unhedged closures are clearly marked for investigation

## Usage

The CSV logger runs automatically when the bot starts. No configuration needed.

Files are stored in: `./logs/trades-YYYY-MM-DD.csv`

## Analysis Tips

### In Excel/Google Sheets:
- Filter by `Action` column to see only ENTRY or EXIT trades
- Filter by `Status` to find PARTIAL or UNHEDGED trades
- Sum `Net P&L USD` column for total profit
- Average `Hold Duration (s)` for average trade time
- Create pivot tables for daily/weekly summaries

### Using Scripts:
```javascript
const fs = require('fs');
const csv = require('csv-parser');

const results = [];
fs.createReadStream('logs/trades-2026-01-12.csv')
  .pipe(csv())
  .on('data', (data) => results.push(data))
  .on('end', () => {
    const totalPnl = results
      .filter(r => r['Net P&L USD'])
      .reduce((sum, r) => sum + parseFloat(r['Net P&L USD']), 0);
    console.log(`Total P&L: $${totalPnl.toFixed(2)}`);
  });
```

## Next Steps

1. ✅ CSV logging implemented and tested
2. ✅ Build completed successfully
3. ⏳ Start bot to generate first CSV file
4. ⏳ Monitor CSV file for trade entries

The bot will now record every trade action to CSV for easy tracking and analysis!

