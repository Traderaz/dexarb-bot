# 🤖 BTC Perpetual Arbitrage Bot

High-performance arbitrage bot for BTC-PERP trading between Nado and Lighter exchanges with web-based remote control.

## 🌟 Features

- ✅ **Automated Arbitrage:** Detects and executes basis trades between Nado and Lighter
- ✅ **Web Dashboard:** Control your bot from anywhere in the world
- ✅ **Risk Management:** Configurable entry/exit thresholds with automatic hedging
- ✅ **24/7 Operation:** Designed for continuous deployment on VPS
- ✅ **Live Monitoring:** Real-time logs and position tracking
- ✅ **Emergency Controls:** One-click position closure with aggressive limits
- ✅ **Secure:** API keys and private keys never exposed to frontend

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js >= 18.0.0
- npm or yarn
- Nado and Lighter accounts configured

### Installation

```bash
# Clone repository
git clone <your-repo-url>
cd dexarb

# Install dependencies
npm install

# Build TypeScript
npm run build

# Start the bot
npm start
```

### Configuration

1. Copy `config.example.json` to `config.json`
2. Fill in your exchange credentials:
   - Nado: wallet address, private key, subaccount details
   - Lighter: API key, API secret
3. Adjust trading parameters:
   - `entryGapUsd`: Minimum price gap to enter (e.g., 100)
   - `exitGapUsd`: Maximum gap to exit (e.g., 40)
   - `positionSizeBtc`: Size per trade (e.g., 0.1 BTC)

## 🌐 Web Interface

### Local Testing

```bash
# Install Express
npm install

# Start web server
npm run start:web

# Open browser
# http://localhost:3000
```

### Production Deployment

See **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** for complete VPS setup instructions.

**Quick Summary:**
1. Deploy to VPS (Ubuntu server)
2. Install Node.js and PM2
3. Configure environment variables
4. Start web server with PM2
5. Set up Nginx + SSL for HTTPS
6. Access from anywhere!

## 🎮 Web Dashboard Features

### 3 Control Buttons:
1. **▶️ Start Bot** - Launches the arbitrage bot
2. **⏹️ Stop Bot** - Gracefully stops the bot
3. **🚨 Emergency Close** - Immediately closes all positions

### Real-time Features:
- Live bot status (Running/Stopped)
- Uptime counter
- Streaming logs
- Position monitoring

### Security:
- Password-protected API
- Keys stored only on server
- HTTPS support
- No sensitive data in frontend

## 📊 How It Works

1. **Market Monitoring:** Bot continuously fetches orderbook data from both exchanges
2. **Opportunity Detection:** When price gap exceeds `entryGapUsd`, bot enters
3. **Execution:** Simultaneously opens LONG on cheaper exchange, SHORT on expensive exchange
4. **Exit Monitoring:** Waits for gap to compress to `exitGapUsd`
5. **Position Close:** Closes both legs simultaneously with aggressive limits
6. **Profit/Loss:** Reports P&L including fees and airdrop value

### Execution Strategy:
- **Nado:** 0.01% aggressive limit orders (0.0001x factor)
- **Lighter:** 0.001% aggressive limit orders (0.00001x factor, deeper liquidity)
- **Both:** Minimize slippage while ensuring instant fills

### Risk Management:
- Lock mechanism prevents race conditions
- Simultaneous execution of both legs
- Emergency close if one leg fails
- Position verification after entry

## 💰 Profitability

### Cost Breakdown (per 0.1 BTC trade):
- **Lighter fees:** 0.002% maker = ~$0.18 per side
- **Nado fees:** 0.01% maker = ~$0.90 per side
- **Total fees:** ~$2.20 per round trip
- **Slippage:** ~$20-40 per round trip (aggressive crossing)
- **Total cost:** ~$22-42 per trade

### Profit Sources:
1. **Gap capture:** Entry gap - Exit gap (e.g., $100 - $40 = $60 on 1 BTC)
2. **Airdrop points:** $100 per 0.1 BTC trade (example value)

### Example Trade:
- Entry: $100 gap → Capture $10 on 0.1 BTC
- Exit: $40 gap → Pay $4 on 0.1 BTC
- Net gap: $6
- Costs: $22
- **Trading P&L:** -$16
- **Airdrop value:** +$100
- **Total:** +$84 ✅

## 🔧 Configuration

### Key Parameters in `config.json`:

```json
{
  "entryGapUsd": 100,        // Min gap to enter (higher = safer, fewer trades)
  "exitGapUsd": 40,          // Max gap to exit (lower = faster exit)
  "positionSizeBtc": 0.1,    // Trade size
  "maxPositionSizeBtc": 0.1, // Position limit
  "checkIntervalMs": 5000,   // Market check frequency
  
  "fees": {
    "nadoMakerFeeBps": 1,    // 0.01%
    "nadoTakerFeeBps": 3.5,  // 0.035%
    "lighterMakerFeeBps": 0.2, // 0.002%
    "lighterTakerFeeBps": 0.2  // 0.002%
  }
}
```

### Environment Variables (`.env`):

```bash
WEB_PORT=3000                    # Web server port
WEB_API_KEY=your_secret_password # API authentication
```

## 📁 Project Structure

```
dexarb/
├── src/                    # TypeScript source
│   ├── core/               # Strategy and execution logic
│   ├── exchanges/          # Exchange adapters (Nado, Lighter)
│   ├── config/             # Configuration management
│   └── index.ts            # Main entry point
├── public/                 # Web frontend
│   └── index.html          # Dashboard UI
├── web-server.js           # Express API server
├── emergency-close-api.js  # Position closing logic
├── lighter-order.js        # Lighter FFI integration
├── config.json             # Bot configuration (git-ignored)
├── package.json            # Dependencies
└── DEPLOYMENT_GUIDE.md     # VPS deployment instructions
```

## 🔐 Security Best Practices

### ✅ DO:
- Use strong API key for web interface
- Deploy with HTTPS (use Let's Encrypt)
- Keep `config.json` and `.env` out of git
- Use SSH keys for VPS access
- Regularly update dependencies
- Monitor bot logs for anomalies

### ❌ DON'T:
- Commit private keys or API keys to git
- Use default passwords in production
- Expose port 3000 directly (use Nginx reverse proxy)
- Share your API key
- Run bot on untrusted networks

## 📈 Monitoring

### Bot Logs:
```bash
# View live logs (if running with PM2)
pm2 logs arb-web

# Or check log files
tail -f bot-combined.log
tail -f bot-error.log
```

### Exchange Positions:
- Nado: Check web app or query API
- Lighter: Check web app (position API is unreliable)

### Web Dashboard:
- Access via browser to see real-time logs
- Monitor uptime and status
- View recent trades and P&L

## 🐛 Troubleshooting

### Bot won't start:
- Check `config.json` is valid JSON
- Verify API keys are correct
- Check `npm run build` completes successfully
- View logs: `pm2 logs` or `node dist/index.js`

### Positions not hedged:
- Verify both exchanges have sufficient margin
- Check if one leg failed (emergency close recommended)
- Review logs for execution errors

### High slippage:
- Market moved quickly between detection and execution
- Consider reducing position size
- Adjust aggressive crossing factors

### Web interface unauthorized:
- Check `WEB_API_KEY` in `.env` file
- Clear browser cache and retry
- Verify web server is running: `pm2 status`

## 📞 Support

For issues or questions:
1. Check logs first
2. Review `DEPLOYMENT_GUIDE.md` for setup help
3. Verify configuration matches examples
4. Test with smaller position sizes first

## 📜 License

MIT License - See LICENSE file for details

## ⚠️ Disclaimer

This software is for educational purposes. Cryptocurrency trading carries significant risk. Only trade with funds you can afford to lose. The authors are not responsible for any financial losses incurred through the use of this software.

---

**Built for 24/7 airdrop farming and basis trading on Nado ↔ Lighter** 🚀
