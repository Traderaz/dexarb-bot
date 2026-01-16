# Lighter Order Placement Issue - January 6, 2026

## Current Status: ❌ NOT WORKING

Lighter API has been updated and the current implementation is incompatible.

## Error Details

**Error Code:** 21136  
**Error Message:** "invalid PublicKey, update the sdk to the latest version"

## What We've Tried

1. ✅ **Updated DLL** - Downloaded latest `lighter-signer-windows-amd64.dll` from Python SDK
2. ✅ **Fixed Function Signature** - Removed `hint_order_index` parameters
3. ✅ **Fixed Price Rounding** - Rounded prices to $0.10 increments
4. ✅ **Fixed Margin Buffer** - Set to 0% (was blocking trades)
5. ❌ **Order Placement** - Still fails with error 21136

## Root Cause

The Lighter API has changed its authentication method. The error "invalid PublicKey" indicates:
- The API key format has changed, OR
- A new authentication token is required, OR
- The signing method has changed

## Possible Solutions

### Option 1: Use Lighter Python SDK (Recommended)
Install and use the official Python SDK which is up-to-date:
```bash
pip install lighter-sdk
```

Then create a Python wrapper that the Node.js bot can call.

### Option 2: Contact Lighter Support
- Get updated documentation for the new API authentication
- Request Node.js/JavaScript SDK or examples
- Ask about the error code 21136

### Option 3: Reverse Engineer Python SDK
- Study how the Python SDK authenticates
- Implement the same authentication in JavaScript
- May require understanding the new signing/token method

## What's Working

✅ **Position Fetching** - Can read positions via `/api/v1/account`  
✅ **Market Data** - Can fetch orderbook via `/api/v1/orderBookOrders`  
✅ **Account Info** - Can get balance and margin  
✅ **Nado Orders** - Working perfectly  
❌ **Lighter Orders** - Blocked by authentication error

## Impact on Bot

The bot currently:
- ✅ Detects gaps correctly
- ✅ Passes margin checks (after fixing buffer)
- ✅ Places Nado orders successfully
- ❌ **FAILS on Lighter orders** (error 21136)
- ✅ Emergency closes Nado position (to prevent unhedged exposure)

## Temporary Workaround

Until Lighter orders are fixed, the bot will:
1. Detect gap > $100
2. Attempt to place orders on both exchanges
3. Nado order succeeds
4. Lighter order fails with 400 error
5. Bot immediately closes Nado position (emergency procedure)
6. Enter 60-second cooldown

**Result:** No trades executed, but no unhedged positions either (safe).

## Next Steps

1. **Contact Lighter Support** - Ask about error 21136 and new authentication
2. **Check Lighter Discord/Telegram** - See if others have this issue
3. **Consider Python SDK** - May be faster than waiting for docs
4. **Monitor Lighter API** - Check if they release updated documentation

## Files Modified

- `lighter-order.js` - Updated DLL function signature
- `src/core/execution.ts` - Added price rounding for Lighter
- `config.json` - Set margin buffer to 0%
- `lighter-signer-windows-amd64.dll` - Updated to latest version

## Test Commands

```bash
# Test Lighter order placement
node test-lighter-simple.js

# Test market order
node test-market-order.js

# Check positions
node check-positions.js

# Analyze gaps
node analyze-gaps.js
```

## Conclusion

The bot is **95% ready** but blocked by Lighter API authentication changes. Once we resolve the authentication issue, trades will execute automatically when gaps exceed $100.

**Priority:** HIGH - Need to fix Lighter authentication to enable trading.

