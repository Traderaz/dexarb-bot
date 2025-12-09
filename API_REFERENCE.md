# 📡 API Reference

Complete reference for monitoring and controlling your arbitrage bot.

## Base URL

```
http://localhost:3000
```

Or your server IP if deployed.

## Authentication

All `/api/*` endpoints require authentication via API key.

**Method 1: Header**
```bash
curl -H "X-API-KEY: your_api_key_here" http://localhost:3000/api/positions
```

**Method 2: Query Parameter**
```bash
curl http://localhost:3000/api/positions?apiKey=your_api_key_here
```

---

## Core Control Endpoints

### `GET /api/status`
Get bot status

**Response:**
```json
{
  "running": true,
  "pid": 12345,
  "uptime": 3600,
  "logs": [...]
}
```

### `POST /api/start`
Start the trading bot

**Response:**
```json
{
  "success": true,
  "message": "Bot started",
  "pid": 12345
}
```

### `POST /api/stop`
Stop the trading bot

**Response:**
```json
{
  "success": true,
  "message": "Bot stop signal sent"
}
```

### `POST /api/close-all`
Emergency close all positions

**Response:**
```json
{
  "success": true,
  "message": "Emergency close initiated",
  "result": {...}
}
```

---

## Monitoring Endpoints

### `GET /api/positions`
Get current positions on both exchanges

**Response:**
```json
{
  "lighter": {
    "position": {
      "symbol": "BTC-PERP",
      "size": 0.1,
      "side": "LONG",
      "entryPrice": 91500.50,
      "markPrice": 91600.00,
      "unrealizedPnl": 10.00,
      "margin": 9150.00
    },
    "error": null
  },
  "nado": {
    "position": {
      "symbol": "BTC-PERP",
      "size": 0.1,
      "side": "SHORT",
      "entryPrice": 91650.00,
      "markPrice": 91600.00,
      "unrealizedPnl": 5.00,
      "margin": 9165.00
    },
    "error": null
  },
  "timestamp": "2025-12-09T17:00:00.000Z"
}
```

### `GET /api/market`
Get current market data and price gap

**Response:**
```json
{
  "lighter": {
    "data": {
      "bid": 91500.00,
      "ask": 91502.00,
      "mid": 91501.00,
      "spread": 2.00
    },
    "error": null
  },
  "nado": {
    "data": {
      "bid": 91598.00,
      "ask": 91600.00,
      "mid": 91599.00,
      "spread": 2.00
    },
    "error": null
  },
  "gap": {
    "absolute": 98.00,
    "percentage": 0.107,
    "bps": 10.7,
    "direction": "NADO_HIGHER"
  },
  "timestamp": "2025-12-09T17:00:00.000Z"
}
```

### `GET /api/balances`
Get account balances on both exchanges

**Response:**
```json
{
  "lighter": {
    "balance": {
      "totalBalance": 10000.00,
      "availableBalance": 8500.00,
      "marginBalance": 9150.00,
      "unrealizedPnl": 10.00
    },
    "error": null
  },
  "nado": {
    "balance": {
      "totalBalance": 10000.00,
      "availableBalance": 8600.00,
      "marginBalance": 9165.00,
      "unrealizedPnl": 5.00
    },
    "error": null
  },
  "timestamp": "2025-12-09T17:00:00.000Z"
}
```

### `GET /api/hedging`
Check if positions are properly hedged

**Response:**
```json
{
  "timestamp": "2025-12-09T17:00:00.000Z",
  "isHedged": true,
  "status": "HEDGED",
  "lighter": {
    "symbol": "BTC-PERP",
    "size": 0.1,
    "side": "LONG",
    "entryPrice": 91500.50,
    "markPrice": 91600.00,
    "unrealizedPnl": 10.00,
    "margin": 9150.00
  },
  "nado": {
    "symbol": "BTC-PERP",
    "size": 0.1,
    "side": "SHORT",
    "entryPrice": 91650.00,
    "markPrice": 91600.00,
    "unrealizedPnl": 5.00,
    "margin": 9165.00
  },
  "details": "Properly hedged: LONG 0.1 on Lighter, SHORT 0.1 on Nado"
}
```

**Possible statuses:**
- `FLAT` - No positions open
- `HEDGED` - Properly hedged with opposite positions
- `UNHEDGED_SAME_SIDE` - ⚠️ Both positions same direction (RISK!)
- `UNHEDGED_SIZE_MISMATCH` - ⚠️ Position sizes don't match
- `UNHEDGED_ONE_SIDE` - ⚠️ Position only on one exchange

### `GET /api/stats`
Get trading statistics from bot logs

**Response:**
```json
{
  "totalEntries": 15,
  "totalExits": 12,
  "successfulEntries": 14,
  "failedEntries": 1,
  "emergencyCloses": 1,
  "lastEntry": "2025-12-09 16:30:15.123 [INFO]: ✓ SPREAD OPENED...",
  "lastExit": "2025-12-09 16:45:20.456 [INFO]: ✓ SPREAD CLOSED...",
  "recentTrades": [
    {
      "type": "ENTRY",
      "timestamp": "2025-12-09 16:30:15",
      "gap": 125.50,
      "lighterSize": 0.1,
      "lighterPrice": 91500.50,
      "nadoSize": 0.1,
      "nadoPrice": 91626.00
    },
    {
      "type": "EXIT",
      "timestamp": "2025-12-09 16:45:20",
      "gap": 35.00
    }
  ]
}
```

### `GET /api/dashboard`
Get all monitoring data in one request

**Response:**
Combines all the above endpoints into a single response with:
- `botRunning`
- `positions`
- `marketData`
- `balances`
- `hedgingStatus`
- `stats`

### `GET /api/logs`
Get bot logs (paginated)

**Query Parameters:**
- `limit` (default: 100) - Number of logs to return
- `offset` (default: 0) - Offset from the end

**Response:**
```json
{
  "total": 5000,
  "logs": [
    {
      "timestamp": "2025-12-09T17:00:00.000Z",
      "type": "info",
      "message": "Bot started successfully"
    }
  ]
}
```

---

## Quick Commands

### Check Positions
```bash
# Using npm script
npm run positions

# Or directly
node check-positions.js
```

### Check Bot Status
```bash
# Using npm script
npm run status

# Or directly
node check-bot-status.js
```

### Test Order Placement
```bash
npm run test:order
```

---

## Example Usage

### Python
```python
import requests

API_KEY = "your_api_key_here"
BASE_URL = "http://localhost:3000"

# Check positions
response = requests.get(
    f"{BASE_URL}/api/positions",
    headers={"X-API-KEY": API_KEY}
)
positions = response.json()
print(f"Lighter: {positions['lighter']['position']}")
print(f"Nado: {positions['nado']['position']}")

# Check hedging status
response = requests.get(
    f"{BASE_URL}/api/hedging",
    headers={"X-API-KEY": API_KEY}
)
hedging = response.json()
if not hedging['isHedged']:
    print(f"⚠️ WARNING: {hedging['status']}")
```

### JavaScript/Node.js
```javascript
const axios = require('axios');

const API_KEY = 'your_api_key_here';
const BASE_URL = 'http://localhost:3000';

async function checkPositions() {
  const response = await axios.get(`${BASE_URL}/api/positions`, {
    headers: { 'X-API-KEY': API_KEY }
  });
  
  console.log('Lighter:', response.data.lighter.position);
  console.log('Nado:', response.data.nado.position);
}

checkPositions();
```

### cURL
```bash
# Set your API key
API_KEY="your_api_key_here"

# Check positions
curl -H "X-API-KEY: $API_KEY" http://localhost:3000/api/positions | jq

# Get dashboard (all data)
curl -H "X-API-KEY: $API_KEY" http://localhost:3000/api/dashboard | jq

# Emergency close
curl -X POST -H "X-API-KEY: $API_KEY" http://localhost:3000/api/close-all
```

---

## Webhooks (Future Enhancement)

You can poll these endpoints from:
- Discord bot
- Telegram bot  
- Mobile app
- Trading dashboard
- Alert system

Example: Set up a cron job to check hedging status every minute and alert if unhedged.

---

## Security Notes

1. **Change default API key** in `.env` file
2. **Use HTTPS** if accessing over internet
3. **Firewall** - Only allow trusted IPs to access port 3000
4. **Never expose** your API key in git or public places

---

**Last Updated:** December 9, 2025

