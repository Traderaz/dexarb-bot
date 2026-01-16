# Exchange API Status Report

## ✅ Both Exchanges Have Full API Functionality

### 🔷 Lighter Exchange (Mantle Network)

**Status:** ✅ Fully Functional

**Endpoints Used:**
- `/api/v1/account` - Account info & positions ✓
- `/api/v1/orderBookOrders` - Market data (orderbook) ✓

**Capabilities:**
- ✅ **Position Fetching** - Correctly retrieves open positions
- ✅ **Account Info** - Gets balance, available balance, collateral
- ✅ **Market Data** - Fetches orderbook for bid/ask prices
- ✅ **Mark Price** - Calculated from current market mid-price
- ✅ **Order Placement** - Market & limit orders via FFI client
- ✅ **P&L Calculation** - Accurate with entry price and mark price

**Implementation:**
- Uses REST API for data fetching
- Uses FFI-based order client for trade execution
- Properly handles FLAT positions (no open positions)
- Fetches real-time mark price from orderbook when position exists

---

### 🟣 Nado Exchange (Ink Network)

**Status:** ✅ Fully Functional

**Endpoints Used:**
- `POST /v1/query` - Subaccount info & positions ✓
- `POST /v1/execute` - Order placement ✓
- SDK methods for account summary ✓

**Capabilities:**
- ✅ **Position Fetching** - Via REST API query endpoint
  - Endpoint: `POST /v1/query` with `type: 'subaccount_info'`
  - Returns `perp_balances` array with position data
  - Correctly parses position size, entry price, and calculates P&L
  
- ✅ **Account Info** - Via Nado SDK
  - `getSubaccountSummary()` method
  - Returns balance, health, available margin
  
- ✅ **Market Data** - Via SDK
  - `getMarketLiquidity()` for orderbook
  - Fetches bid/ask prices with depth
  
- ✅ **Mark Price** - Fetched from market data
  - Uses current mid-price from orderbook
  - Fallback to entry price if market data unavailable
  
- ✅ **Order Placement** - Via Gateway API
  - Limit orders with POST_ONLY option
  - Market orders with IOC (Immediate or Cancel)
  - EIP-712 signature-based authentication
  
- ✅ **P&L Calculation** - Accurate calculation
  - Entry price calculated from `vQuoteBalance / amount`
  - Unrealized P&L = `amount * (markPrice - entryPrice)`

**Implementation:**
- Uses official `@nadohq/client` SDK
- REST API for position queries
- Gateway API for order execution
- Proper EIP-712 signing for orders
- Handles both long and short positions correctly

---

## 📊 Position Detection & P&L Accuracy

### Position Detection Flow

Both exchanges correctly implement position detection:

1. **Lighter:**
   ```typescript
   GET /api/v1/account?by=index&value={accountIndex}
   → Returns positions array
   → Filters positions where |size| > 0.0001
   → Fetches mark price from orderbook
   ```

2. **Nado:**
   ```typescript
   POST /v1/query with { type: 'subaccount_info', subaccount: senderHash }
   → Returns perp_balances array
   → Filters where |amount| > 0.0001
   → Calculates entry price from vQuoteBalance
   → Fetches mark price from market data
   ```

### P&L Calculation Accuracy

**✅ Accurate P&L with Fees Included**

The bot calculates P&L in multiple layers:

#### 1. Individual Exchange P&L (from API)
```javascript
// Lighter
unrealizedPnl = (markPrice - entryPrice) * size  // for long
unrealizedPnl = (entryPrice - markPrice) * size  // for short

// Nado
unrealizedPnl = amount * (markPrice - entryPrice)
```

#### 2. Combined Hedged P&L (in monitoring API)
```javascript
// From api-monitoring-v2.js
lighterUnrealized = (lighterMark - lighterEntry) * size  // long
nadoUnrealized = (nadoEntry - nadoMark) * size          // short

grossUnrealized = lighterUnrealized + nadoUnrealized

// Entry fees already paid
lighterEntryFee = lighterEntry * size * (0 / 10000)      // 0 bps
nadoEntryFee = nadoEntry * size * (3.5 / 10000)          // 3.5 bps
feesPaid = lighterEntryFee + nadoEntryFee

// Estimated exit fees
lighterExitFee = lighterMark * size * (0 / 10000)        // 0 bps
nadoExitFee = nadoMark * size * (3.5 / 10000)            // 3.5 bps
estimatedExitFees = lighterExitFee + nadoExitFee

// Net P&L after all fees
netUnrealized = grossUnrealized - feesPaid - estimatedExitFees
```

**Fee Configuration (from config.json):**
- Lighter Maker: 0 bps
- Lighter Taker: 0 bps
- Nado Maker: 3.5 bps
- Nado Taker: 3.5 bps

---

## 🧪 Testing Results

### Lighter API Tests
```bash
node test-lighter-api.js
```
✅ All tests passing:
- Orderbook fetching
- Account info retrieval
- Position detection (FLAT and open positions)
- Market ID mapping

### Nado API Tests
```bash
node check-positions.js
```
✅ All tests passing:
- Position fetching via REST API
- Account authentication
- Market data retrieval
- Hedging status detection

---

## 📈 Real-Time Position Monitoring

### Check Positions Script
```bash
node check-positions.js
```

**Output includes:**
- ✅ Lighter position (size, side, entry, mark, P&L)
- ✅ Nado position (size, side, entry, mark, P&L)
- ✅ Price gap between exchanges
- ✅ Hedging status (FLAT, HEDGED, UNHEDGED)
- ✅ Net P&L breakdown with fees

### Web Interface
```bash
# Start web server
npm run web

# Access at http://localhost:3000
```

**Dashboard shows:**
- Real-time positions on both exchanges
- Current market prices and gap
- P&L with fee breakdown
- Hedging status
- Trading statistics

---

## 🎯 Conclusion

### ✅ Both APIs Fully Functional

1. **Position Fetching:** Both exchanges correctly fetch and parse open positions
2. **Mark Price:** Both fetch real-time market prices for accurate P&L
3. **Entry Price:** Both correctly store/calculate entry prices
4. **P&L Calculation:** Accurate unrealized P&L on both exchanges
5. **Fee Accounting:** All fees (entry + exit) properly calculated
6. **Hedging Detection:** Correctly identifies hedged vs unhedged states

### ✅ Ready for Live Trading

The bot will:
- ✅ Correctly detect entry opportunities (price gaps)
- ✅ Execute orders on both exchanges
- ✅ Monitor positions with accurate P&L
- ✅ Detect exit conditions based on gap convergence
- ✅ Close positions when profitable
- ✅ Track all fees for accurate net P&L

### 📊 P&L Accuracy Guarantee

Your trades will have accurate P&L because:
1. **Entry prices** are stored correctly by both exchanges
2. **Mark prices** are fetched in real-time from orderbooks
3. **Fees** are calculated using exact fee rates from config
4. **Net P&L** includes all entry and exit fees
5. **Position sizes** are tracked precisely (to 0.0001 BTC)

---

**Last Updated:** January 4, 2026  
**Status:** ✅ Production Ready

