# 📊 Monitoring API - Complete Guide

## Overview

Your bot now has **accurate monitoring endpoints** that show real positions, P&L including fees, and all trading data.

## ✅ What's Working

### 1. Position Checking
- ✅ Real-time positions from both exchanges
- ✅ Accurate P&L calculations
- ✅ **Includes all fees** (entry + estimated exit)
- ✅ Works with actual exchange SDKs (not REST hacks)

### 2. Fee Calculations

**Lighter Fees:**
- Taker: 0.02% (0.2 bps)
- Maker: 0.002% (0.02 bps)

**Nado Fees:**
- Taker: 0.035% (3.5 bps)
- Maker: 0.01% (1 bps)

**Your Strategy:**
- Lighter: Market orders (taker fee)
- Nado: Limit orders (maker fee)

### 3. P&L Breakdown

When you have an open position, you'll see:

```
💰 P&L BREAKDOWN (Including Fees)
────────────────────────────────────────────────────────────
  Gross P&L: $15.00
  Fees Paid (Entry): -$2.50
  Est. Fees (Exit): -$2.50
  Total Fees: -$5.00
  ────────────────────────
  🟢 Net P&L: $10.00

  Breakdown:
    Lighter P&L: $10.00
    Lighter Fees: -$1.83
    Nado P&L: $5.00
    Nado Fees: -$3.17
```

## Quick Commands

### Check Positions (CLI)
```bash
npm run positions
```

Shows:
- Current positions on both exchanges
- Mark prices and entry prices
- Current price gap
- Hedging status
- **Complete P&L with fees**

### Check Bot Status
```bash
npm run status
```

Verifies:
- FFI client configuration
- DLL presence
- Build status
- Environment variables

### Test Order (Safe)
```bash
npm run test:order
```

Places a test limit order at $85,000 (won't fill at current prices)

## API Endpoints

### Base URL
```
http://localhost:3000  (or your server IP)
```

### Authentication
All endpoints require API key in header or query:
```bash
# Header (recommended)
curl -H "X-API-KEY: your_key" http://localhost:3000/api/positions

# Query parameter
curl "http://localhost:3000/api/positions?apiKey=your_key"
```

### Available Endpoints

#### 1. `/api/positions`
Get current positions with accurate P&L

**Response includes:**
- Lighter position (size, side, entry, mark, PnL)
- Nado position (size, side, entry, mark, PnL)
- **Combined P&L breakdown with fees**

#### 2. `/api/market`
Get current market data and price gap

**Response includes:**
- Bid/ask/mid prices on both exchanges
- Spread on each exchange
- Price gap (absolute, %, bps)
- Entry/exit thresholds
- Can enter/exit signals

#### 3. `/api/balances`
Get account balances

#### 4. `/api/hedging`
Check if positions are properly hedged

**Statuses:**
- `FLAT` - No positions
- `HEDGED` - ✅ Properly hedged (opposite positions)
- `UNHEDGED_SAME_SIDE` - ⚠️ **DANGER**: Both same direction
- `UNHEDGED_SIZE_MISMATCH` - ⚠️ Size mismatch
- `UNHEDGED_ONE_SIDE` - ⚠️ Only one exchange has position

#### 5. `/api/stats`
Get trading statistics from logs

**Shows:**
- Total entries/exits
- Success/failure counts
- Emergency closes
- Recent trades

#### 6. `/api/dashboard`
**Get everything in one call** - all the above combined

#### 7. `/api/status`
Bot running status

#### 8. `/api/start`, `/api/stop`, `/api/close-all`
Control endpoints

## Example Usage

### Python - Check Positions
```python
import requests

API_KEY = "your_key_here"
response = requests.get(
    "http://localhost:3000/api/positions",
    headers={"X-API-KEY": API_KEY}
)

data = response.json()

if data['pnl']:
    print(f"Gross P&L: ${data['pnl']['grossUnrealized']:.2f}")
    print(f"Total Fees: ${data['pnl']['totalFees']:.2f}")
    print(f"Net P&L: ${data['pnl']['netUnrealized']:.2f}")
```

### JavaScript - Monitor Hedging
```javascript
const axios = require('axios');

setInterval(async () => {
  const response = await axios.get('http://localhost:3000/api/hedging', {
    headers: { 'X-API-KEY': process.env.WEB_API_KEY }
  });
  
  if (!response.data.isHedged) {
    console.log('⚠️  ALERT:', response.data.status);
    console.log('Details:', response.data.details);
    // Send notification...
  }
}, 60000); // Check every minute
```

### cURL - Get Dashboard
```bash
API_KEY="your_key_here"
curl -s -H "X-API-KEY: $API_KEY" \
  http://localhost:3000/api/dashboard | jq '.'
```

## Fee Calculation Details

### Entry Fees (Paid Immediately)
```
Lighter Entry Fee = entry_price × size × 0.0002  (0.02%)
Nado Entry Fee = entry_price × size × 0.0001     (0.01%)
```

### Exit Fees (Estimated)
```
Lighter Exit Fee = mark_price × size × 0.0002
Nado Exit Fee = mark_price × size × 0.0001
```

### Net P&L Formula
```
Gross P&L = Lighter P&L + Nado P&L
Total Fees = Entry Fees + Estimated Exit Fees
Net P&L = Gross P&L - Total Fees
```

### Example Trade
```
Entry:
  Lighter LONG 0.1 BTC @ $91,500
  Nado SHORT 0.1 BTC @ $91,650
  Gap: $150

Exit:
  Lighter mark @ $91,600
  Nado mark @ $91,600
  Gap: $0

Gross P&L:
  Lighter: ($91,600 - $91,500) × 0.1 = $10.00
  Nado: ($91,650 - $91,600) × 0.1 = $5.00
  Total: $15.00

Fees:
  Lighter Entry: $91,500 × 0.1 × 0.0002 = $1.83
  Lighter Exit: $91,600 × 0.1 × 0.0002 = $1.83
  Nado Entry: $91,650 × 0.1 × 0.0001 = $0.92
  Nado Exit: $91,600 × 0.1 × 0.0001 = $0.92
  Total: $5.50

Net P&L: $15.00 - $5.50 = $9.50
```

## Monitoring Dashboard Ideas

### 1. Discord Bot
Poll `/api/hedging` every minute and alert if unhedged

### 2. Telegram Bot
Send daily summary from `/api/stats`

### 3. Web Dashboard
Real-time display of `/api/dashboard` data

### 4. Mobile Notifications
Alert on large gaps from `/api/market`

### 5. Profit Tracker
Log `/api/positions` PnL to database for analysis

## Files Created/Modified

**New Files:**
- `api-monitoring-v2.js` - Enhanced monitoring with accurate P&L
- `check-positions.js` - CLI position checker
- `API_REFERENCE.md` - Complete API documentation
- `MONITORING_API_GUIDE.md` - This file

**Modified Files:**
- `web-server.js` - Added new endpoints
- `package.json` - Added npm scripts
- `check-bot-status.js` - Status verification

**Removed Files:**
- `lighter-order-sdk.js` - Broken WASM SDK
- `test-lighter-limit*.js` - Old test files
- `api-monitoring.js` - Old REST-based version

## Next Steps

1. **Deploy to server** if not already done
2. **Set strong API key** in `.env`:
   ```bash
   WEB_API_KEY=$(openssl rand -base64 32)
   ```
3. **Start web server**:
   ```bash
   npm run start:web
   ```
4. **Test endpoints** from another terminal or Postman

## Security Reminder

- ⚠️ **Never expose port 3000** directly to internet
- ✅ Use Nginx reverse proxy with HTTPS
- ✅ Set firewall rules to allow only trusted IPs
- ✅ Use strong API key (32+ random characters)
- ✅ Monitor access logs regularly

---

**Last Updated:** December 9, 2025  
**Status:** ✅ Fully Tested and Working

