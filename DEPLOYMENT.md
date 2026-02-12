# Deployment Guide - SysAid Backend

Step-by-step guide to deploy your backend to production.

## 🎯 Deployment Options Summary

| Platform | Difficulty | Cost | Best For |
|----------|-----------|------|----------|
| **Azure App Service** | Easy | ~$10/month | Enterprise, existing Azure |
| **Heroku** | Easiest | Free tier available | Quick testing |
| **AWS Elastic Beanstalk** | Medium | Pay-as-you-go | AWS ecosystem |
| **Docker + VM** | Hard | Variable | Full control |
| **Vercel/Netlify** | N/A | N/A | Not suitable (need server) |

## ⭐ Recommended: Azure App Service

### Prerequisites
- Azure account
- Azure CLI installed
- Git installed

### Step 1: Prepare Your Code

```bash
cd sysaid-backend

# Create production .env (don't commit this!)
cat > .env.production << EOF
SYSAID_BASE_URL=https://parkson.sysaidit.com
SYSAID_ACCOUNT_ID=parkson
SYSAID_CLIENT_ID=Cxa0feraR1urG4Hy0J41wBHAPQgyghF6
SYSAID_CLIENT_SECRET=1QvLObuqUH_kel39LbZ4rGdKR1ZVvcln61ZIkytUVKJRU1IFbjDJJhDqQtloudbY
PORT=8080
NODE_ENV=production
EOF

# Test locally first
npm start
npm test
```

### Step 2: Login to Azure

```bash
az login
az account set --subscription "Your Subscription Name"
```

### Step 3: Create Resource Group

```bash
az group create \
  --name sysaid-backend-rg \
  --location eastus
```

### Step 4: Create App Service Plan

```bash
# Free tier (for testing)
az appservice plan create \
  --name sysaid-plan \
  --resource-group sysaid-backend-rg \
  --sku F1 \
  --is-linux

# Or production tier
az appservice plan create \
  --name sysaid-plan \
  --resource-group sysaid-backend-rg \
  --sku B1 \
  --is-linux
```

### Step 5: Create Web App

```bash
az webapp create \
  --resource-group sysaid-backend-rg \
  --plan sysaid-plan \
  --name sysaid-proxy-prod \
  --runtime "NODE:18-lts"
```

**Your backend URL:** `https://sysaid-proxy-prod.azurewebsites.net`

### Step 6: Configure Environment Variables

```bash
az webapp config appsettings set \
  --resource-group sysaid-backend-rg \
  --name sysaid-proxy-prod \
  --settings \
    SYSAID_BASE_URL="https://parkson.sysaidit.com" \
    SYSAID_ACCOUNT_ID="parkson" \
    SYSAID_CLIENT_ID="Cxa0feraR1urG4Hy0J41wBHAPQgyghF6" \
    SYSAID_CLIENT_SECRET="1QvLObuqUH_kel39LbZ4rGdKR1ZVvcln61ZIkytUVKJRU1IFbjDJJhDqQtloudbY" \
    NODE_ENV="production"
```

### Step 7: Deploy Code

**Option A: ZIP Deployment**

```bash
# Create deployment package
zip -r deploy.zip . -x "*.git*" -x "node_modules/*" -x ".env*"

# Deploy
az webapp deployment source config-zip \
  --resource-group sysaid-backend-rg \
  --name sysaid-proxy-prod \
  --src deploy.zip
```

**Option B: Git Deployment**

```bash
# Initialize git if needed
git init
git add .
git commit -m "Initial deployment"

# Get deployment credentials
az webapp deployment list-publishing-credentials \
  --resource-group sysaid-backend-rg \
  --name sysaid-proxy-prod

# Add remote and push
git remote add azure https://<deployment-user>@sysaid-proxy-prod.scm.azurewebsites.net/sysaid-proxy-prod.git
git push azure main
```

### Step 8: Verify Deployment

```bash
# Check logs
az webapp log tail \
  --resource-group sysaid-backend-rg \
  --name sysaid-proxy-prod

# Test health endpoint
curl https://sysaid-proxy-prod.azurewebsites.net/api/health
```

Should return:
```json
{
  "status": "healthy",
  "timestamp": "2025-02-08T..."
}
```

### Step 9: Update SPFx

In your SPFx `SysAidService.ts`:

```typescript
private readonly backendUrl = 'https://sysaid-proxy-prod.azurewebsites.net';
```

### Step 10: Enable CORS (if needed)

```bash
az webapp cors add \
  --resource-group sysaid-backend-rg \
  --name sysaid-proxy-prod \
  --allowed-origins https://yourtenant.sharepoint.com
```

---

## 🚀 Alternative: Heroku Deployment

### Prerequisites
- Heroku account
- Heroku CLI installed

### Step 1: Login to Heroku

```bash
heroku login
```

### Step 2: Create Heroku App

```bash
cd sysaid-backend
heroku create sysaid-proxy
```

**Your backend URL:** `https://sysaid-proxy.herokuapp.com`

### Step 3: Set Environment Variables

```bash
heroku config:set \
  SYSAID_BASE_URL=https://parkson.sysaidit.com \
  SYSAID_ACCOUNT_ID=parkson \
  SYSAID_CLIENT_ID=Cxa0feraR1urG4Hy0J41wBHAPQgyghF6 \
  SYSAID_CLIENT_SECRET=1QvLObuqUH_kel39LbZ4rGdKR1ZVvcln61ZIkytUVKJRU1IFbjDJJhDqQtloudbY \
  NODE_ENV=production
```

### Step 4: Deploy

```bash
# Initialize git if needed
git init
git add .
git commit -m "Deploy to Heroku"

# Push to Heroku
git push heroku main
```

### Step 5: Verify

```bash
# Check logs
heroku logs --tail

# Test
curl https://sysaid-proxy.herokuapp.com/api/health
```

### Step 6: Scale (Optional)

```bash
# Check current dynos
heroku ps

# Scale up if needed
heroku ps:scale web=1
```

---

## 🐳 Docker Deployment

### Step 1: Create Dockerfile

```dockerfile
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy app source
COPY . .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["node", "server.js"]
```

### Step 2: Create .dockerignore

```
node_modules
npm-debug.log
.env
.env.*
.git
.gitignore
README.md
*.md
```

### Step 3: Build Image

```bash
docker build -t sysaid-proxy:latest .
```

### Step 4: Run Locally (Test)

```bash
docker run -p 3000:3000 \
  -e SYSAID_CLIENT_ID=Cxa0feraR1urG4Hy0J41wBHAPQgyghF6 \
  -e SYSAID_CLIENT_SECRET=1QvLObuqUH_kel39LbZ4rGdKR1ZVvcln61ZIkytUVKJRU1IFbjDJJhDqQtloudbY \
  -e SYSAID_BASE_URL=https://parkson.sysaidit.com \
  -e SYSAID_ACCOUNT_ID=parkson \
  sysaid-proxy:latest
```

### Step 5: Deploy to Azure Container Registry

```bash
# Create ACR
az acr create \
  --resource-group sysaid-backend-rg \
  --name sysaidregistry \
  --sku Basic

# Login to ACR
az acr login --name sysaidregistry

# Tag image
docker tag sysaid-proxy:latest sysaidregistry.azurecr.io/sysaid-proxy:latest

# Push to ACR
docker push sysaidregistry.azurecr.io/sysaid-proxy:latest

# Deploy to Azure Container Instances
az container create \
  --resource-group sysaid-backend-rg \
  --name sysaid-proxy \
  --image sysaidregistry.azurecr.io/sysaid-proxy:latest \
  --dns-name-label sysaid-proxy \
  --ports 3000 \
  --environment-variables \
    SYSAID_CLIENT_ID=Cxa0feraR1urG4Hy0J41wBHAPQgyghF6 \
    SYSAID_CLIENT_SECRET=1QvLObuqUH_kel39LbZ4rGdKR1ZVvcln61ZIkytUVKJRU1IFbjDJJhDqQtloudbY
```

---

## 🔍 Post-Deployment Checklist

After deploying to any platform:

### 1. Verify Health Endpoint
```bash
curl https://your-backend-url/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "...",
  "sysaid": {
    "baseUrl": "https://parkson.sysaidit.com",
    "accountId": "parkson",
    "tokenCached": true
  }
}
```

### 2. Test All Endpoints

```bash
# Weekly metrics
curl https://your-backend-url/api/metrics/weekly

# Active tickets
curl https://your-backend-url/api/tickets/active

# Detailed tickets
curl https://your-backend-url/api/tickets/detailed?limit=5
```

### 3. Update SPFx Configuration

In `SysAidService.ts`:
```typescript
private readonly backendUrl = 'https://your-actual-backend-url';
```

### 4. Test from SPFx

1. Update backend URL in SPFx service
2. Run `gulp serve`
3. Add web part to workbench
4. Check browser DevTools → Network tab
5. Verify requests go to your backend
6. Confirm data loads correctly

### 5. Monitor Logs

**Azure:**
```bash
az webapp log tail --resource-group sysaid-backend-rg --name sysaid-proxy-prod
```

**Heroku:**
```bash
heroku logs --tail --app sysaid-proxy
```

### 6. Set Up Monitoring

**Azure Application Insights:**
```bash
az monitor app-insights component create \
  --app sysaid-proxy-insights \
  --location eastus \
  --resource-group sysaid-backend-rg \
  --application-type Node.JS

# Link to web app
az webapp config appsettings set \
  --resource-group sysaid-backend-rg \
  --name sysaid-proxy-prod \
  --settings APPINSIGHTS_INSTRUMENTATIONKEY=<key>
```

---

## 🔐 Security Hardening

### 1. Use Managed Identities (Azure)

Instead of storing credentials:

```bash
# Create managed identity
az webapp identity assign \
  --resource-group sysaid-backend-rg \
  --name sysaid-proxy-prod

# Store secrets in Key Vault
az keyvault create \
  --name sysaid-vault \
  --resource-group sysaid-backend-rg

az keyvault secret set \
  --vault-name sysaid-vault \
  --name sysaid-client-secret \
  --value "1QvLObuqUH_kel39LbZ4rGdKR1ZVvcln61ZIkytUVKJRU1IFbjDJJhDqQtloudbY"
```

### 2. Restrict CORS

In `server.js`, change to:
```javascript
const corsOptions = {
  origin: 'https://stlawrenceparks.sharepoint.com',
  credentials: true
};
```

### 3. Add Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

app.use('/api/', limiter);
```

### 4. Enable HTTPS Only

```bash
az webapp update \
  --resource-group sysaid-backend-rg \
  --name sysaid-proxy-prod \
  --https-only true
```

---

## 💰 Cost Estimates

### Azure App Service

| Tier | Price/Month | Use Case |
|------|-------------|----------|
| F1 Free | $0 | Testing only (60 min/day limit) |
| B1 Basic | ~$13 | Development |
| S1 Standard | ~$70 | Production |
| P1V2 Premium | ~$150 | High traffic |

### Heroku

| Tier | Price/Month | Use Case |
|------|-------------|----------|
| Free | $0 | Testing (sleeps after 30 min) |
| Hobby | $7 | Development |
| Standard 1X | $25 | Production |
| Performance | $250+ | High traffic |

---

## 🆘 Troubleshooting Deployment

### Issue: Deployment fails

**Check:**
```bash
# Azure
az webapp log tail --resource-group sysaid-backend-rg --name sysaid-proxy-prod

# Heroku
heroku logs --tail
```

### Issue: App crashes on startup

**Common causes:**
- Missing environment variables
- Port binding (use `process.env.PORT`)
- Dependencies not installed

**Fix:**
```bash
# Verify env vars are set
az webapp config appsettings list --resource-group sysaid-backend-rg --name sysaid-proxy-prod

# Restart app
az webapp restart --resource-group sysaid-backend-rg --name sysaid-proxy-prod
```

### Issue: Can't reach backend from SPFx

**Check:**
1. Backend URL is correct
2. CORS is configured
3. App is running (not sleeping)
4. No firewall blocking

---

## ✅ Success Indicators

Deployment is successful when:

- [x] Health check returns 200 OK
- [x] All API endpoints return data
- [x] SPFx web part loads data
- [x] No errors in backend logs
- [x] Monitoring is active

---

**🎉 Congratulations!** Your backend is deployed and your SPFx dashboard is CORS-free!
