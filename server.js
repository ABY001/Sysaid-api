const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   CORS (SPFx-safe)
========================= */
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    const allowed = (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map(o => o.trim());

    if (
      origin.includes('.sharepoint.com') ||
      origin.startsWith('http://localhost') ||
      origin.startsWith('http://127.0.0.1') ||
      allowed.includes(origin)
    ) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: false,
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: '*'
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

/* =========================
   SysAid Config
========================= */
const SYSAID_CONFIG = {
  baseUrl: process.env.SYSAID_BASE_URL,
  accountId: process.env.SYSAID_ACCOUNT_ID,
  clientId: process.env.SYSAID_CLIENT_ID,
  clientSecret: process.env.SYSAID_CLIENT_SECRET
};

/* =========================
   Token Cache
========================= */
let tokenCache = { token: null, expiresAt: null };

async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const response = await axios.post(
    `${SYSAID_CONFIG.baseUrl}/connect/v1/access-tokens`,
    {
      clientId: SYSAID_CONFIG.clientId,
      clientSecret: SYSAID_CONFIG.clientSecret
    },
    {
      headers: {
        'x-sysaid-accountid': SYSAID_CONFIG.accountId,
        'Content-Type': 'application/json'
      }
    }
  );

  tokenCache.token = response.data.token;
  tokenCache.expiresAt =
    Date.now() + (response.data.expiresIn - 300) * 1000;

  return tokenCache.token;
}

/* =========================
   Connect Helper
========================= */
async function callConnect(endpoint) {
  const token = await getAccessToken();

  const response = await axios.get(
    `${SYSAID_CONFIG.baseUrl}/connect/v1${endpoint}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    }
  );

  return response.data;
}

function filterTicketsByStatus(records, status) {
  if (!status || status === 'all') return records;

  if (status === 'open') {
    return records.filter(r => r.status !== 34);
  }

  if (status === 'closed') {
    return records.filter(r => r.status === 34);
  }

  return records;
}

/* =========================
   Health
========================= */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    tokenCached: !!tokenCache.token
  });
});

/* =========================
   Analytics Dashboard
========================= */
app.get('/api/analytics/overview', async (req, res) => {
  try {
    const { limit = 100, status = 'open' } = req.query;

    // Fetch all required data in parallel
    const [serviceRecords, agents, endUsers] = await Promise.all([
      callConnect(`/service-records/search?limit=${limit}`),
      callConnect('/agents?limit=100'),
      callConnect('/end-users?limit=500') // Get more end users to properly count
    ]);

    const allRecords = Array.isArray(serviceRecords) ? serviceRecords : [];
    const records = filterTicketsByStatus(allRecords, status);

    const agentsList = agents.data || [];
    const endUsersList = endUsers.data || [];

    // Create lookup maps
    const agentMap = {};
    agentsList.forEach(agent => {
      agentMap[agent.id] = `${agent.firstName} ${agent.lastName}`.trim();
    });

    const endUserMap = {};
    endUsersList.forEach(user => {
      endUserMap[user.id] = `${user.firstName} ${user.lastName}`.trim();
    });

    // Process data for analytics
    const analytics = {
      assigneeDistribution: processAssigneeDistribution(records, agentMap),
      priorityDistribution: processPriorityDistribution(records),
      topAdministrators: processTopAdministrators(records, agentMap),
      topEndUsers: processTopEndUsers(records, endUserMap),
      summary: {
        total: records.length,
        open: allRecords.filter(r => r.status !== 34).length,
        closed: allRecords.filter(r => r.status === 34).length
      }
    };

    res.json({ success: true, data: analytics });
  } catch (e) {
    console.error('Analytics error:', e);
    res.status(500).json({
      success: false,
      error: e.message,
      details: e.response?.data
    });
  }
});

/* =========================
   Helper Functions
========================= */

function processAssigneeDistribution(records, agentMap) {
  const distribution = {};

  records.forEach(record => {
    const assigneeId = record.assignee;
    let assigneeName = 'Unassigned';

    if (assigneeId && agentMap[assigneeId]) {
      assigneeName = agentMap[assigneeId];
    }

    distribution[assigneeName] = (distribution[assigneeName] || 0) + 1;
  });

  // Convert to array format for charts, sorted by count
  return Object.entries(distribution)
    .map(([name, count]) => ({
      name,
      value: count
    }))
    .sort((a, b) => b.value - a.value);
}

function processPriorityDistribution(records) {
  const priorityMap = {
    1: 'Very High',
    2: 'High',
    3: 'Normal',
    4: 'Low',
    5: 'Very Low'
  };

  const distribution = {};

  records.forEach(record => {
    const priority = priorityMap[record.priority] || 'Unknown';
    distribution[priority] = (distribution[priority] || 0) + 1;
  });

  // Return in priority order
  return Object.entries(distribution)
    .map(([name, count]) => ({
      name,
      value: count
    }))
    .sort((a, b) => {
      const order = { 'Very High': 1, 'High': 2, 'Normal': 3, 'Low': 4, 'Very Low': 5 };
      return (order[a.name] || 999) - (order[b.name] || 999);
    });
}

function processTopAdministrators(records, agentMap) {
  const adminCounts = {};

  // Count tickets per administrator (assignee)
  records.forEach(record => {
    if (record.assignee && agentMap[record.assignee]) {
      const adminName = agentMap[record.assignee];
      adminCounts[adminName] = (adminCounts[adminName] || 0) + 1;
    }
  });

  // Sort and get top 4
  return Object.entries(adminCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
}

function processTopEndUsers(records, endUserMap) {
  const userCounts = {};

  // Count tickets per end user (requestUser)
  records.forEach(record => {
    if (record.requestUser && endUserMap[record.requestUser]) {
      const userName = endUserMap[record.requestUser];
      userCounts[userName] = (userCounts[userName] || 0) + 1;
    }
  });

  // Sort and get top 5
  return Object.entries(userCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

/* =========================
   Tickets (Connect)
========================= */
app.get('/api/tickets', async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;

    const records = await callConnect(
      `/service-records?limit=${limit}&offset=${offset}`
    );

    res.json({ success: true, data: records });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e.message,
      details: e.response?.data
    });
  }
});

/* =========================
   Action Items
========================= */
app.get('/api/tickets/:id/action-items', async (req, res) => {
  try {
    const items = await callConnect(
      `/service-records/${req.params.id}/action-items`
    );

    res.json({
      success: true,
      data: items,
      count: items.length
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e.message,
      details: e.response?.data
    });
  }
});

/* =========================
   Weekly Metrics
========================= */
app.get('/api/metrics/weekly', async (req, res) => {
  try {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    const sevenDaysAgo = now - 7 * day;
    const fourteenDaysAgo = now - 14 * day;

    const response = await callConnect(`/service-records/search?limit=100`);
    const allRecords = Array.isArray(response) ? response : [];
    const { status = 'open' } = req.query;
    const records = filterTicketsByStatus(allRecords, status);

    const currentWeek = records.filter(r =>
      r.updateTime >= sevenDaysAgo
    );

    const previousWeek = records.filter(
      r =>
        r.updateTime >= fourteenDaysAgo &&
        r.updateTime < sevenDaysAgo
    );

    const calcOpenTicketAge = list => {
      if (!list.length) return 0;

      const totalMs = list.reduce((sum, r) => {
        return sum + (Date.now() - r.insertTime);
      }, 0);

      return +(totalMs / list.length / day).toFixed(2);
    };

    const currentMTTR = calcOpenTicketAge(currentWeek);
    const previousMTTR = calcOpenTicketAge(previousWeek);

    res.json({
      success: true,
      data: {
        mttr: {
          value: currentMTTR,
          previousValue: previousMTTR,
          change: previousMTTR
            ? +(
              ((currentMTTR - previousMTTR) / previousMTTR) *
              100
            ).toFixed(2)
            : 0,
          benchmark: '3.5 days'
        },
        satisfaction: {
          value: 4.2,
          change: 2.5,
          benchmark: '4.0/5'
        },
        slaBreachRate: {
          value: 8.5,
          change: -12.3,
          benchmark: 10
        },
        incidentRatio: {
          value: 35,
          change: 5.2,
          benchmark: 30
        },
        meta: {
          currentWeekCount: currentWeek.length,
          previousWeekCount: previousWeek.length
        }
      }
    });
  } catch (e) {
    console.error('Weekly metrics error', e);

    res.status(500).json({
      success: false,
      error: e.message,
      details: e.response?.data
    });
  }
});

/* =========================
   Active Tickets
========================= */
app.get('/api/tickets/active', async (req, res) => {
  try {
    const response = await callConnect(
      `/service-records/search?limit=100`
    );

    const records = Array.isArray(response) ? response : [];
    const activeRecords = records.filter(r => r.status !== 34);

    const now = Date.now();
    const fiveDaysAgo = now - (5 * 24 * 60 * 60 * 1000);

    const overdue = activeRecords.filter(r =>
      r.dueDate && new Date(r.dueDate).getTime() < now
    ).length;

    const openMoreThan5Days = activeRecords.filter(r =>
      r.insertTime && r.insertTime < fiveDaysAgo
    ).length;

    const noDueDate = activeRecords.filter(r => !r.dueDate).length;

    res.json({
      success: true,
      data: {
        totalActive: activeRecords.length,
        overduePercent: activeRecords.length > 0
          ? (overdue / activeRecords.length) * 100
          : 0,
        openMoreThan5Days: activeRecords.length > 0
          ? (openMoreThan5Days / activeRecords.length) * 100
          : 0,
        noDueDate: activeRecords.length > 0
          ? (noDueDate / activeRecords.length) * 100
          : 0
      }
    });
  } catch (e) {
    console.error('Active tickets error:', e);
    res.status(500).json({
      success: false,
      error: e.message,
      details: e.response?.data
    });
  }
});

/* =========================
   Read-only Connect Proxy
========================= */
app.get('/api/connect/*', async (req, res) => {
  try {
    const endpoint = req.path.replace('/api/connect', '');
    const data = await callConnect(endpoint);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* =========================
   Start Server
========================= */
app.listen(PORT, () => {
  console.log(`🚀 SysAid Analytics Backend running on ${PORT}`);
  console.log(`📊 Fetching real data from agents and end-users endpoints`);
});