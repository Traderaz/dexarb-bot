# Supabase Integration Setup Guide

This guide will walk you through setting up Supabase for your DEX arbitrage bot.

## ✅ Completed Steps

1. ✅ Created Supabase project "Dexarb"
2. ✅ Added credentials to `.env` file
3. ✅ Added `@supabase/supabase-js` to package.json
4. ✅ Created database schema file
5. ✅ Integrated SupabaseTradeLogger into bot

## 🔧 Next Steps

### Step 1: Install Dependencies

Open your terminal and run:

```bash
npm install
```

This will install the Supabase JavaScript client.

### Step 2: Create Database Tables

1. Go to your Supabase dashboard: https://supabase.com/dashboard/project/oflnpktmwrjgzowcxz
2. Click on **SQL Editor** in the left sidebar
3. Click **"New query"**
4. Open the file `supabase-schema.sql` in this project
5. Copy ALL the contents and paste into the Supabase SQL Editor
6. Click **"Run"** to create all tables

You should see success messages for:
- `trades` table
- `gaps` table  
- `performance_metrics` table
- Various indexes and views

### Step 3: Verify Connection

Run your bot in development mode:

```bash
npm run dev
```

You should see in the logs:
```
✅ Supabase connection initialized
```

If you see this error instead:
```
⚠️ Supabase not available: [error]. Falling back to local logging only.
```

Then check:
- Your `.env` file has all three variables set correctly
- Your Supabase project is active
- You ran `npm install` successfully

### Step 4: Test Trade Logging

Once your bot makes a trade, it will:
1. ✅ Save to local JSON file (`logs/trades.json`)
2. ✅ Save to CSV file (`logs/trades_YYYY-MM-DD.csv`)
3. ✅ **NEW:** Save to Supabase database

To verify data is in Supabase:
1. Go to Supabase dashboard
2. Click **"Table Editor"** in left sidebar
3. Select the `trades` table
4. You should see your completed trades

## 📊 What's Being Logged

### Trades Table
Every completed arbitrage trade with:
- Entry/exit timestamps and gaps
- Position size and P&L (BTC and USD)
- Exchange prices
- Fees breakdown
- Hold duration

### Gaps Table (Optional - Not Yet Implemented)
Every price gap opportunity detected, whether traded or not:
- Gap size and timestamp
- Which exchanges
- What action was taken (entry/exit/none)
- Reason if opportunity was skipped

### Performance Metrics Table (Optional)
Periodic snapshots of bot performance:
- Total trades, win rate
- Cumulative P&L
- Average hold duration
- Can be logged hourly/daily

## 🔍 Querying Your Data

### View Recent Trades
```sql
SELECT * FROM recent_trades LIMIT 10;
```

### Daily Performance
```sql
SELECT * FROM daily_performance;
```

### Total P&L
```sql
SELECT 
  COUNT(*) as total_trades,
  SUM(realized_pnl_usd - fees_total) as net_pnl_usd,
  AVG(CASE WHEN realized_pnl_usd - fees_total > 0 THEN 1.0 ELSE 0.0 END) as win_rate
FROM trades;
```

## 🎯 Next: Build a Web Dashboard

Now that data is flowing to Supabase, you can:
1. Build a Next.js/React dashboard
2. Add Supabase Auth for user login
3. Create real-time charts with your trading data
4. Monitor bot performance from anywhere

## 🆘 Troubleshooting

### Error: "Missing Supabase credentials"
- Check your `.env` file has:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_KEY`

### Error: "relation 'trades' does not exist"
- You haven't run the SQL schema yet
- Go to Step 2 and create the tables

### Data Not Appearing in Supabase
- Check bot logs for Supabase errors
- Verify your API keys are correct
- Check Supabase project is not paused

## 📁 Files Created

- `src/utils/supabase.ts` - Supabase client and types
- `src/core/supabase-trade-logger.ts` - Enhanced trade logger
- `supabase-schema.sql` - Database schema
- `.env` - Contains your Supabase credentials (DO NOT COMMIT)

## 🔐 Security Note

**NEVER commit your `.env` file to git!** 

It contains sensitive API keys. Make sure `.env` is in your `.gitignore`.
