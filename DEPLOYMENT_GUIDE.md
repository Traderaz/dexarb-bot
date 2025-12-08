# 🚀 Deployment Guide - Run Your Bot Anywhere

This guide shows you how to deploy your arbitrage bot to a VPS with a secure web interface, so you can control it from anywhere in the world.

## 🎯 What You'll Get

- ✅ Bot running 24/7 on a VPS (not your PC)
- ✅ Web interface accessible from anywhere
- ✅ 3 buttons: Start Bot, Stop Bot, Emergency Close
- ✅ Live logs streaming
- ✅ Password protected
- ✅ All keys secured on server (not exposed to frontend)

---

## 📋 Prerequisites

1. **VPS Server** - Recommended:
   - DigitalOcean ($6/month droplet)
   - AWS EC2 (t2.micro ~$10/month)
   - Vultr ($5/month)
   - Linode ($5/month)

2. **Domain (Optional but Recommended)**
   - For HTTPS and easy access
   - Can use services like Cloudflare, Namecheap ($10/year)

---

## 🔧 Step 1: Set Up VPS

### 1.1 Create Ubuntu Server

1. Sign up for DigitalOcean (or your chosen provider)
2. Create a new Droplet:
   - **OS:** Ubuntu 22.04 LTS
   - **Plan:** Basic $6/month (1GB RAM, 1 vCPU)
   - **Location:** Choose closest to you
   - **Authentication:** SSH keys (recommended) or password

3. Note your server IP address (e.g., `123.45.67.89`)

### 1.2 Connect to Your Server

**Windows (PowerShell):**
```powershell
ssh root@YOUR_SERVER_IP
```

**First time?** Install SSH client:
```powershell
# Windows 10/11 already has SSH
# Or download PuTTY: https://www.putty.org/
```

---

## 🛠️ Step 2: Install Dependencies on Server

Once connected to your server:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 (process manager)
sudo npm install -g pm2

# Install build tools
sudo apt install -y build-essential python3

# Verify installations
node --version  # Should show v18.x.x
npm --version   # Should show 9.x.x
```

---

## 📦 Step 3: Upload Your Bot to Server

### Option A: Using Git (Recommended)

On your LOCAL machine, push code to GitHub (private repo):

```bash
# Initialize git (if not already)
cd "C:\Users\Azhar's Desktop\dexarb"
git init
git add .
git commit -m "Initial commit"

# Create private repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

On your SERVER:

```bash
# Clone your repo
cd ~
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git dexarb
cd dexarb
npm install
npm run build
```

### Option B: Using SCP (Direct Upload)

On your LOCAL machine (PowerShell):

```powershell
# Zip your project (exclude node_modules)
Compress-Archive -Path "C:\Users\Azhar's Desktop\dexarb\*" -DestinationPath "C:\Users\Azhar's Desktop\dexarb.zip" -Exclude node_modules

# Upload to server
scp "C:\Users\Azhar's Desktop\dexarb.zip" root@YOUR_SERVER_IP:~/

# SSH into server and extract
ssh root@YOUR_SERVER_IP
cd ~
unzip dexarb.zip -d dexarb
cd dexarb
npm install
npm run build
```

---

## 🔐 Step 4: Configure Environment Variables

On your SERVER, create `.env` file:

```bash
nano .env
```

Add your configuration (IMPORTANT - use a strong API key):

```bash
# Web Server
WEB_PORT=3000
WEB_API_KEY=YOUR_SUPER_SECRET_PASSWORD_HERE_CHANGE_THIS

# Bot Config (these are already in config.json, but you can override)
# NODE_ENV=production
```

Save and exit (`Ctrl+X`, then `Y`, then `Enter`)

**⚠️ IMPORTANT:** Change `WEB_API_KEY` to a strong random password!

Generate one:
```bash
openssl rand -base64 32
```

---

## 🚀 Step 5: Start the Web Server

```bash
# Start web server with PM2
pm2 start web-server.js --name "arb-web"

# Start on system reboot
pm2 startup
pm2 save

# Check status
pm2 status
pm2 logs arb-web
```

---

## 🌐 Step 6: Access Your Bot

### Option A: Direct IP Access (Quick Test)

1. Open your browser
2. Go to: `http://YOUR_SERVER_IP:3000`
3. Enter your `WEB_API_KEY` password
4. You should see the control panel!

### Option B: Use Domain + HTTPS (Recommended)

#### 6.1 Point Domain to Server

1. Buy a domain (e.g., `mybot.com` from Namecheap)
2. Add A record pointing to your server IP:
   ```
   Type: A
   Name: @
   Value: YOUR_SERVER_IP
   ```

#### 6.2 Install Nginx + SSL

On your SERVER:

```bash
# Install Nginx
sudo apt install -y nginx

# Install Certbot for free SSL
sudo apt install -y certbot python3-certbot-nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/arb-bot
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name mybot.com www.mybot.com;  # Change to your domain

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Save and enable:

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/arb-bot /etc/nginx/sites-enabled/

# Test config
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# Get free SSL certificate
sudo certbot --nginx -d mybot.com -d www.mybot.com

# Auto-renew SSL (certbot does this automatically)
```

Now access via: `https://mybot.com` ✅

---

## 📱 Step 7: Using the Web Interface

1. Open `https://mybot.com` (or `http://YOUR_SERVER_IP:3000`)
2. Enter your API key password
3. Use the 3 buttons:
   - **▶️ Start Bot:** Starts the arbitrage bot
   - **⏹️ Stop Bot:** Stops the bot gracefully
   - **🚨 Emergency Close:** Closes all positions immediately

4. Monitor live logs in real-time!

---

## 🔒 Security Best Practices

### ✅ DO:
1. **Use strong API key** - Generate with `openssl rand -base64 32`
2. **Use HTTPS** - Always use SSL certificate (free with Let's Encrypt)
3. **Firewall** - Only allow ports 22 (SSH), 80 (HTTP), 443 (HTTPS)
4. **SSH keys** - Disable password authentication
5. **Regular updates** - Run `apt update && apt upgrade` weekly
6. **Backup config** - Keep `config.json` and `.env` backed up

### ❌ DON'T:
1. **Never commit `.env` to git** - Add it to `.gitignore`
2. **Never use default passwords** - Change `CHANGE_ME_IN_PRODUCTION`
3. **Don't expose port 3000 publicly** - Use Nginx reverse proxy
4. **Don't store keys in frontend** - They're only on server
5. **Don't share your API key** - Treat it like a password

---

## 🔧 Useful Commands

### PM2 Management
```bash
# View logs
pm2 logs arb-web

# Restart
pm2 restart arb-web

# Stop
pm2 stop arb-web

# Delete process
pm2 delete arb-web

# Monitor CPU/Memory
pm2 monit
```

### Check Bot Status
```bash
# View logs
pm2 logs arb-web --lines 100

# Check if bot process is running
pm2 status
```

### Update Bot Code
```bash
cd ~/dexarb
git pull  # If using Git
npm install
npm run build
pm2 restart arb-web
```

---

## 🐛 Troubleshooting

### Bot won't start
```bash
# Check logs
pm2 logs arb-web --err

# Check config
cat config.json

# Test manually
node web-server.js
```

### Can't access web interface
```bash
# Check if server is running
pm2 status

# Check firewall
sudo ufw status
sudo ufw allow 3000/tcp  # If using direct IP

# Check Nginx (if using domain)
sudo systemctl status nginx
sudo nginx -t
```

### "Unauthorized" error
- Make sure you're using the correct `WEB_API_KEY` from your `.env` file
- Check: `cat ~/.env`

---

## 💰 Cost Breakdown

**Monthly Costs:**
- VPS: $5-10/month (DigitalOcean, Vultr)
- Domain: ~$1/month ($10/year)
- SSL: FREE (Let's Encrypt)
- **Total: ~$6-11/month**

**One-time:**
- Domain registration: $10/year

---

## 🎉 You're Done!

Your bot is now:
- ✅ Running 24/7 on a VPS
- ✅ Accessible from anywhere with a beautiful web UI
- ✅ Fully secured with password protection
- ✅ All API keys and private keys hidden on server
- ✅ Live logs visible in real-time

**Control your bot from your phone, laptop, or anywhere in the world!** 🚀

---

## 📞 Support

If you need help:
1. Check PM2 logs: `pm2 logs`
2. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Test manually: `node web-server.js`

