# SysAid Backend Proxy Server

A Node.js/Express backend that proxies requests to SysAid API, solving CORS issues for browser-based SPFx applications.

## 🎯 Problem Solved

**Issue:** SysAid API doesn't allow direct browser calls due to CORS restrictions  
**Solution:** Backend proxy server that makes API calls server-side and returns data to your SPFx web part

## 📁 Project Structure

```
sysaid-backend/
├── server.js                   # Main Express server
├── package.json                # Dependencies
├── .env                        # Environment variables (your credentials)
├── .gitignore                  # Git ignore rules
├── test-api.js                 # API testing script
├── SysAidService-SPFx.ts       # Updated SPFx service (for your web part)
└── README.md                   # This file
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd sysaid-backend
npm install
```

### 2. Configure Environment

The `.env` file already has your credentials. Verify they're correct:

```env
SYSAID_BASE_URL=https://parkson.sysaidit.com
SYSAID_ACCOUNT_ID=###
SYSAID_CLIENT_ID=###
SYSAID_CLIENT_SECRET=###
PORT=3000
```

### 3. Start Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

Server starts at: `http://localhost:3000`

### 4. Test the API

```bash
npm test
```

This runs the test suite to verify all endpoints work correctly.

## 📡 API Endpoints

### Health Check
```
GET /api/health
```
Returns server status and configuration.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-02-08T10:30:00.000Z",
  "sysaid": {
    "baseUrl": "https://parkson.sysaidit.com",
    "accountId": "parkson",
    "tokenCached": true
  }
}
```

### Get Weekly Metrics
```
GET /api/metrics/weekly
```
Returns dashboard KPIs (MTTR, SLA, incidents, satisfaction).

**Response:**
```json
{
  "success": true,
  "data": {
    "mttr": {
      "value": 3.7,
      "previousValue": 3.9,
      "change": -5.1,
      "benchmark": 3.5
    },
    "slaBreachRate": { ... },
    "incidentRatio": { ... },
    "satisfaction": { ... }
  }
}
```

### Get Active Tickets
```
GET /api/tickets/active
```
Returns active tickets breakdown.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalActive": 61,
    "incidentRatio": 34,
    "open1to5Days": 10,
    "openMoreThan5Days": 90,
    "overduePercent": 25,
    "noDueDate": 66,
    "handoffs": 5
  }
}
```

### Get Detailed Tickets
```
GET /api/tickets/detailed?limit=50
```
Returns ticket list for table view.

**Query Parameters:**
- `limit` - Number of tickets to return (default: 50)

### Get All Tickets
```
GET /api/tickets?filter=&limit=1000&offset=0
```
Returns raw ticket data with optional filtering.

**Query Parameters:**
- `filter` - SysAid filter expression (e.g., `status != 'Closed'`)
- `limit` - Maximum tickets to return (default: 1000)
- `offset` - Pagination offset (default: 0)

### Generic Proxy
```
GET/POST /api/proxy/*
```
Proxy any SysAid API endpoint.

**Example:**
```
GET /api/proxy/api/v1/sr/12345
→ Calls: https://parkson.sysaidit.com/api/v1/sr/12345
```

## 🔐 Authentication Flow

The backend handles SysAid authentication automatically:

1. **First request:** Backend requests access token from SysAid
2. **Token cached:** Stored in memory with expiry time
3. **Subsequent requests:** Uses cached token
4. **Token refresh:** Automatically refreshes before expiry

**You don't need to worry about authentication in your SPFx code!**

## 🌐 CORS Configuration

The server allows requests from:
- ✅ All SharePoint domains (`*.sharepoint.com`)
- ✅ Localhost (for development)
- ✅ 127.0.0.1 (for testing)

**To add specific origins**, edit `server.js`:

```javascript
const allowedOrigins = [
  /\.sharepoint\.com$/,
  /localhost/,
  'https://yourdomain.com'  // Add custom domains
];
```

## 📦 Deployment Options

### Option 1: Azure App Service (Recommended)

1. **Create Azure App Service:**
   ```bash
   az webapp create \
     --name sysaid-proxy \
     --resource-group your-rg \
     --plan your-plan \
     --runtime "NODE|18-lts"
   ```

2. **Deploy code:**
   ```bash
   az webapp deployment source config-zip \
     --resource-group your-rg \
     --name sysaid-proxy \
     --src deploy.zip
   ```

3. **Configure environment variables:**
   ```bash
   az webapp config appsettings set \
     --resource-group your-rg \
     --name sysaid-proxy \
     --settings \
       SYSAID_CLIENT_ID="your-id" \
       SYSAID_CLIENT_SECRET="your-secret"
   ```

4. **Your backend URL:**
   ```
   https://sysaid-proxy.azurewebsites.net
   ```

### Option 2: Heroku

1. **Create Heroku app:**
   ```bash
   heroku create sysaid-proxy
   ```

2. **Set environment variables:**
   ```bash
   heroku config:set SYSAID_CLIENT_ID=your-id
   heroku config:set SYSAID_CLIENT_SECRET=your-secret
   ```

3. **Deploy:**
   ```bash
   git push heroku main
   ```

4. **Your backend URL:**
   ```
   https://sysaid-proxy.herokuapp.com
   ```

### Option 3: Docker

1. **Create Dockerfile:**
   ```dockerfile
   FROM node:18-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production
   COPY . .
   EXPOSE 3000
   CMD ["node", "server.js"]
   ```

2. **Build and run:**
   ```bash
   docker build -t sysaid-proxy .
   docker run -p 3000:3000 --env-file .env sysaid-proxy
   ```

### Option 4: Local Development Server

For testing only (not for production):

```bash
npm start
```

Access at `http://localhost:3000`

## 🔧 Update Your SPFx Web Part

### Step 1: Replace SysAidService.ts

Copy `SysAidService-SPFx.ts` to your SPFx project:

```
src/webparts/sysAidDashboard/services/SysAidService.ts
```

### Step 2: Update Backend URL

In the new `SysAidService.ts`, update the backend URL:

```typescript
// For local development
private readonly backendUrl = 'http://localhost:3000';

// For production (after deployment)
private readonly backendUrl = 'https://sysaid-proxy.azurewebsites.net';
```

**Or use environment variable:**

In your SPFx `config/serve.json`:
```json
{
  "serveConfigurations": {
    "default": {
      "env": {
        "REACT_APP_BACKEND_URL": "http://localhost:3000"
      }
    }
  }
}
```

### Step 3: No Other Changes Needed!

The rest of your SPFx code stays the same. The service methods have the same signatures:

```typescript
const service = new SysAidService(this.context.httpClient);

// Same methods work the same way
const metrics = await service.getWeeklyMetrics();
const tickets = await service.getActiveTickets();
const details = await service.getDetailedTickets(50);
```

## 🧪 Testing

### Test Backend Locally

```bash
# Terminal 1: Start backend
npm start

# Terminal 2: Run tests
npm test
```

### Test from SPFx

```bash
# Terminal 1: Backend running on port 3000
cd sysaid-backend
npm start

# Terminal 2: SPFx workbench
cd your-spfx-project
gulp serve
```

### Verify in Browser

1. Open SPFx workbench
2. Add SysAid Dashboard web part
3. Open DevTools → Network tab
4. Should see requests to `http://localhost:3000/api/*`
5. Should see 200 OK responses
6. Dashboard should load with data

## 🐛 Troubleshooting

### Backend won't start

**Error:** `Port 3000 already in use`

**Fix:**
```bash
# Find process using port 3000
lsof -i :3000

# Kill it
kill -9 <PID>

# Or use different port
PORT=3001 npm start
```

### Can't connect to SysAid

**Error:** `Failed to authenticate with SysAid`

**Check:**
1. `.env` file has correct credentials
2. `SYSAID_BASE_URL` is correct
3. Client ID and secret are valid
4. Network can reach SysAid API

**Test manually:**
```bash
curl -X POST https://parkson.sysaidit.com/connect/v1/access-tokens \
  -H "x-sysaid-accountid: parkson" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"your-id","clientSecret":"your-secret"}'
```

### CORS errors in SPFx

**Error:** `Access-Control-Allow-Origin` error

**Fix:**
1. Check backend is running
2. Verify backend URL in `SysAidService.ts`
3. Check CORS config in `server.js`
4. Ensure SharePoint domain is allowed

### No data returned

**Error:** Dashboard shows 0 for everything

**Check:**
1. Backend is running: `GET http://localhost:3000/api/health`
2. Credentials are correct
3. SysAid account has data
4. Check backend logs for errors

## 📊 Monitoring

### View Logs

```bash
# Development
# Logs appear in terminal where you ran npm start

# Production (Azure)
az webapp log tail --name sysaid-proxy --resource-group your-rg

# Production (Heroku)
heroku logs --tail --app sysaid-proxy
```

### Health Monitoring

Set up monitoring for:
```
GET https://your-backend.com/api/health
```

Should return `200 OK` with:
```json
{
  "status": "healthy",
  "timestamp": "2025-02-08T10:30:00.000Z"
}
```

## 🔒 Security Best Practices

### Production Checklist

- [ ] Move credentials to environment variables (not `.env` file)
- [ ] Use Azure Key Vault or similar for secrets
- [ ] Enable HTTPS only
- [ ] Restrict CORS to specific SharePoint tenant
- [ ] Add rate limiting
- [ ] Enable request logging
- [ ] Set up monitoring/alerts
- [ ] Use process manager (PM2) for Node.js
- [ ] Implement health checks
- [ ] Add authentication (if needed)

### Example: Restrict to Your Tenant

In `server.js`:

```javascript
const corsOptions = {
  origin: 'https://yourtenant.sharepoint.com',
  credentials: true
};
```

### Example: Add Rate Limiting

```bash
npm install express-rate-limit
```

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

## 📝 Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SYSAID_BASE_URL` | SysAid instance URL | `https://parkson.sysaidit.com` | Yes |
| `SYSAID_ACCOUNT_ID` | SysAid account ID | `parkson` | Yes |
| `SYSAID_CLIENT_ID` | OAuth client ID | - | Yes |
| `SYSAID_CLIENT_SECRET` | OAuth client secret | - | Yes |
| `PORT` | Server port | `3000` | No |
| `NODE_ENV` | Environment | `development` | No |

## 🎉 Success Checklist

Your backend is working correctly when:

- [x] `npm start` runs without errors
- [x] `npm test` shows all tests passing
- [x] `GET /api/health` returns 200 OK
- [x] `GET /api/metrics/weekly` returns data
- [x] SPFx web part loads data
- [x] No CORS errors in browser console
- [x] Dashboard displays metrics

## 📚 Additional Resources

- Express.js Docs: https://expressjs.com/
- SysAid API Docs: https://developers.sysaid.com/
- Azure App Service: https://docs.microsoft.com/azure/app-service/
- Node.js Best Practices: https://github.com/goldbergyoni/nodebestpractices

---

**Built with ❤️ to solve CORS issues**  
**Questions?** Check the troubleshooting section or review the test output.
