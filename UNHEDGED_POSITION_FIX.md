# Fix for Unhedged Position Problem ($100 Loss)

## Problem Identified

Your bot lost $100 today because **new positions were opening while old positions were still closing**, causing unhedged exposure.

### Root Cause: Missing Lock During Exit

The bot had a lock mechanism (`isExecutingTrade`) to prevent concurrent **entry** trades, but:

1. ❌ **The `executeExit()` function DID NOT set the lock**
2. ❌ **The `evaluateExit()` function DID NOT check the lock**

This created a race condition:

```
Time    Action                          State        Lock     Hedge Status
------  ------------------------------  -----------  -------  ---------------
16:20   Position A opens                OPEN         FALSE    ✅ Hedged
16:21   Exit condition met              OPEN         FALSE    ✅ Hedged
16:21   executeExit() called            OPEN         FALSE    ⚠️  Still hedged
16:21   Exit orders placed              OPEN→FLAT    FALSE    ⚠️  Orders pending
16:21   State set to FLAT               FLAT         FALSE    ⚠️  Orders still filling
16:21   Next market update              FLAT         FALSE    ⚠️  Orders still filling
16:21   Bot sees entry opportunity      FLAT         FALSE    ⚠️  Orders still filling
16:21   Position B opens                OPEN         FALSE    ❌ UNHEDGED!
16:21   Old exit orders fill                                  ❌ UNHEDGED!
```

### The Result:
- Position A: LONG 0.1 Lighter, SHORT 0.1 Nado (closing)
- Position B: LONG 0.1 Lighter, SHORT 0.1 Nado (opening)
- **Net exposure: 2x LONG Lighter, 2x SHORT Nado** (technically hedged)
- But when Position A closes: **Net becomes 1x LONG Lighter, 1x SHORT Nado**
- If timing is bad: **Temporarily UNHEDGED = exposed to price movement = LOSS**

## Fixes Applied

### 1. Added Lock to `executeExit()`

```typescript
private async executeExit(...): Promise<void> {
  // SET LOCK - Prevent concurrent trade execution
  this.isExecutingTrade = true;
  this.logger.info('🔒 LOCK ACQUIRED (EXIT) - No new trades until exit completes');
  
  try {
    // ... execute exit ...
    
    // RELEASE LOCK - Exit completed successfully
    this.isExecutingTrade = false;
    this.logger.info('🔓 LOCK RELEASED (EXIT) - Bot can now enter new positions');
    
  } catch (error) {
    // RELEASE LOCK on error too
    this.isExecutingTrade = false;
    this.logger.warn('🔓 LOCK RELEASED (exit error occurred)');
    throw error;
  }
}
```

### 2. Added Lock Check to `evaluateExit()`

```typescript
private async evaluateExit(): Promise<void> {
  // SAFETY CHECK: LOCK - Don't evaluate exit if another trade is executing
  if (this.isExecutingTrade) {
    this.logger.debug('🔒 Trade execution in progress - skipping exit evaluation');
    return;
  }
  
  // ... rest of exit evaluation ...
}
```

## How It Works Now

```
Time    Action                          State        Lock     Hedge Status
------  ------------------------------  -----------  -------  ---------------
16:20   Position A opens                OPEN         FALSE    ✅ Hedged
16:21   Exit condition met              OPEN         FALSE    ✅ Hedged
16:21   executeExit() called            OPEN         TRUE ✅   ✅ Hedged
16:21   Exit orders placed              OPEN         TRUE ✅   ✅ Hedged
16:21   State set to FLAT               FLAT         TRUE ✅   ✅ Hedged
16:21   Next market update              FLAT         TRUE ✅   ✅ Hedged
16:21   Bot sees entry opportunity      FLAT         TRUE ✅   ✅ Hedged
16:21   evaluateEntry() called          FLAT         TRUE ✅   ✅ Hedged
16:21   🔒 LOCK CHECK BLOCKS ENTRY      FLAT         TRUE ✅   ✅ Hedged
16:21   Exit orders fill                FLAT         TRUE ✅   ✅ Hedged
16:21   Lock released                   FLAT         FALSE    ✅ Hedged (FLAT)
16:22   Bot sees entry opportunity      FLAT         FALSE    ✅ Hedged (FLAT)
16:22   New position opens safely       OPEN         TRUE     ✅ Hedged
```

## Log Viewing Scripts (For Server)

Created 3 scripts to help you view logs without auto-scrolling:

### 1. `view-logs.sh` - Static view (no auto-scroll)
```bash
./view-logs.sh combined 100    # Last 100 lines of combined log
./view-logs.sh error 50        # Last 50 lines of error log
./view-logs.sh all 200         # Last 200 lines of both logs
```

### 2. `view-logs-live.sh` - Live view with PAUSE control
```bash
./view-logs-live.sh combined   # Live combined log

# Controls:
# Ctrl+S = PAUSE (stops auto-scrolling, you can scroll up/down)
# Ctrl+Q = RESUME (resumes auto-scrolling)
# Ctrl+C = EXIT
```

### 3. `search-logs.sh` - Search for specific patterns
```bash
./search-logs.sh "ENTRY"              # Find all entries
./search-logs.sh "ERROR" 5            # Find errors with 5 lines context
./search-logs.sh "Position OPENED"    # Find all position opens
./search-logs.sh "UNHEDGED"           # Find unhedged situations
```

## Deployment Steps

### On Your Server:

1. **Pull the latest code:**
   ```bash
   cd /path/to/dexarb
   git pull
   ```

2. **Rebuild the bot:**
   ```bash
   npm run build
   ```

3. **Restart the bot:**
   ```bash
   pm2 restart dexarb-bot
   # or
   pm2 restart all
   ```

4. **Watch logs with pause control:**
   ```bash
   ./view-logs-live.sh combined
   ```
   Press `Ctrl+S` to pause, scroll up to read, `Ctrl+Q` to resume

5. **Verify the fix is working:**
   ```bash
   ./search-logs.sh "LOCK ACQUIRED"
   ```
   You should see BOTH entry and exit locks being acquired

## Expected Behavior After Fix

In the logs, you should now see:

```
🔒 LOCK ACQUIRED - No new trades until this completes
Executing spread entry: LONG 0.1 on Lighter, SHORT 0.1 on Nado
✓ SPREAD OPENED
🔓 LOCK RELEASED - Bot can now monitor for exit

[Later...]

🔒 LOCK ACQUIRED (EXIT) - No new trades until exit completes
Executing spread exit
✓ SPREAD CLOSED
🔓 LOCK RELEASED (EXIT) - Bot can now enter new positions
```

**Key Difference:** The exit now acquires the lock, preventing new entries from interfering!

## Testing Recommendation

1. Run the bot in a low-volume period
2. Watch for multiple entry/exit cycles
3. Use `./search-logs.sh "LOCK"` to verify locks are working
4. Monitor your positions on both exchanges to ensure they stay hedged

## Additional Fix: Emergency Position Close

### Problem 2: Force Close Wasn't Working

The `handlePartialFillEmergency()` function that detects and closes unhedged positions **was broken** because:

**Lighter's `getPosition()` was returning hardcoded zeros!**

```typescript
// OLD (BROKEN):
async getPosition(symbol: string): Promise<Position> {
  return {
    symbol,
    side: 'long',
    size: 0,  // ❌ Always zero - can't detect real positions!
    ...
  };
}
```

This meant the emergency close logic could NEVER detect Lighter positions, so it wouldn't close them!

### Fix Applied:

Implemented actual position querying for Lighter using the `/api/v1/account` endpoint:

```typescript
async getOpenPositions(): Promise<Position[]> {
  const response = await axios.get(`${this.config.restApiUrl}/api/v1/account`, {
    params: {
      by: 'index',
      value: this.config.accountIndex
    }
  });

  const account = response.data?.accounts?.[0];
  const positions: Position[] = [];

  for (const pos of account.positions) {
    const positionSize = parseFloat(pos.position || '0');
    if (Math.abs(positionSize) > 0.0001) {
      positions.push({
        symbol: pos.market_id === 1 ? 'BTC-PERP' : `MARKET-${pos.market_id}`,
        side: positionSize > 0 ? 'long' : 'short',
        size: Math.abs(positionSize),
        entryPrice: parseFloat(pos.avg_entry_price || '0'),
        markPrice: parseFloat(pos.mark_price || pos.avg_entry_price || '0'),
        unrealizedPnl: parseFloat(pos.unrealized_pnl || '0'),
        ...
      });
    }
  }
  return positions;
}
```

Now `handlePartialFillEmergency()` can properly detect and close unhedged positions on **BOTH** exchanges!

## Files Changed

- `src/core/strategy.ts` - Added lock to exit functions
- `src/exchanges/lighter.ts` - Implemented real position querying (CRITICAL FIX)
- `view-logs.sh` - Static log viewer (new)
- `view-logs-live.sh` - Live log viewer with pause (new)
- `search-logs.sh` - Log search tool (new)

## Summary

The bot was opening new positions before old ones finished closing, creating temporary unhedged exposure. The fix ensures that **only one trade operation (entry OR exit) can happen at a time**, maintaining proper hedging at all times.

**Estimated impact:** This should eliminate the unhedged position losses. Your $100 loss today was from this race condition.

