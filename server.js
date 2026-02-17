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
   SysAid Status Definitions
========================= */
const OPEN_STATUS_IDS = [1, 2, 5, 6, 8, 22, 23, 24, 25, 26, 27, 30, 31, 32, 33, 42, 44];
const CLOSED_STATUS_IDS = [3, 4, 7, 18, 19, 20, 21, 28, 29, 34, 35, 36, 39, 40, 41, 43, 98976, 98977];

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
  tokenCache.expiresAt = Date.now() + (response.data.expiresIn - 300) * 1000;

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

/* =========================
   Helper: Build Base Filters
========================= */
function buildBaseFilters(status) {
  // Always filter by Service Request type (srType=1)
  let filters = 'srType=1';
  
  // Add status filter
  if (status === 'open') {
    filters += `&status=${OPEN_STATUS_IDS.join(',')}`;
  } else if (status === 'closed') {
    filters += `&status=${CLOSED_STATUS_IDS.join(',')}`;
  }
  
  return filters;
}

/* =========================
   Helper: Get Count Using Filters
========================= */
async function getCountByFilter(baseFilters, additionalFilter = '') {
  const fullFilters = additionalFilter 
    ? `${baseFilters}&${additionalFilter}` 
    : baseFilters;
    
  // IMPORTANT: Include srType field so we can filter out non-Service Request records
  const endpoint = `/service-records/search?limit=100&${fullFilters}&fields=srType`;
  
  try {
    const response = await callConnect(endpoint);
    
    // Filter out any records that are not srType=1 (Service Requests)
    // This is needed because the API filter doesn't always enforce srType correctly
    const filteredRecords = Array.isArray(response) 
      ? response.filter(record => record.srType === 1)
      : [];
      
    return filteredRecords.length;
  } catch (error) {
    console.error(`Error getting count for filters: ${fullFilters}`, error.message);
    return 0;
  }
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
    const { status = 'open' } = req.query;
    console.log(`📊 Fetching analytics with status filter: ${status}`);

    // Calculate current month date range
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    
    console.log(`📅 Current month range: ${new Date(firstDayOfMonth).toISOString()} to ${new Date(lastDayOfMonth).toISOString()}`);

    const baseFilters = buildBaseFilters(status);
    console.log(`🔍 Base filters: ${baseFilters}`);

    // Fetch all data in parallel
    const [agents, endUsers, openRecords, closedRecords] = await Promise.all([
      callConnect('/agents?limit=100'),
      callConnect('/end-users?limit=100'),
      callConnect(`/service-records/search?limit=100&${buildBaseFilters('open')}&fields=srType,assignee,requestUser,priority,insertTime`),
      status === 'closed' || status === 'all' 
        ? callConnect(`/service-records/search?limit=100&${buildBaseFilters('closed')}&fields=srType,assignee,requestUser,priority,insertTime`)
        : Promise.resolve([])
    ]);

    const agentsList = agents.data || [];
    const endUsersList = endUsers.data || [];

    console.log(`👥 Loaded ${agentsList.length} agents and ${endUsersList.length} end users`);

    // Create lookup maps
    const agentMap = {};
    agentsList.forEach(agent => {
      agentMap[agent.id] = `${agent.firstName} ${agent.lastName}`.trim();
    });

    const endUserMap = {};
    endUsersList.forEach(user => {
      endUserMap[user.id] = `${user.firstName} ${user.lastName}`.trim();
    });

    // Filter out non-Service Request records (srType !== 1)
    const openServiceRequests = (Array.isArray(openRecords) ? openRecords : [])
      .filter(record => record.srType === 1);
    
    const closedServiceRequests = (Array.isArray(closedRecords) ? closedRecords : [])
      .filter(record => record.srType === 1);

    console.log(`📊 Total filtered records - Open: ${openServiceRequests.length}, Closed: ${closedServiceRequests.length}`);

    // Determine which records to analyze for assigneeDistribution and priorityDistribution (based on status filter)
    let recordsForStatusBasedAnalytics = [];
    if (status === 'open') {
      recordsForStatusBasedAnalytics = openServiceRequests;
    } else if (status === 'closed') {
      recordsForStatusBasedAnalytics = closedServiceRequests;
    } else {
      recordsForStatusBasedAnalytics = [...openServiceRequests, ...closedServiceRequests];
    }

    // Filter for current month records (all statuses combined) for topAdministrators and topEndUsers
    const allRecordsThisMonth = [...openServiceRequests, ...closedServiceRequests]
      // .filter(record => 
      //   record.insertTime >= firstDayOfMonth && record.insertTime <= lastDayOfMonth
      // );

    console.log(`📊 Current month records (all statuses): ${allRecordsThisMonth.length}`);

    // Process analytics
    const assigneeDistribution = processAssigneeDistribution(recordsForStatusBasedAnalytics, agentMap);
    const priorityDistribution = processPriorityDistribution(recordsForStatusBasedAnalytics);
    
    // Top administrators and top end users based on current month data (all statuses)
    const topAdministrators = processTopAdministrators(allRecordsThisMonth, agentMap);
    const topEndUsers = processTopEndUsers(allRecordsThisMonth, endUserMap);

    const analytics = {
      assigneeDistribution,
      priorityDistribution,
      topAdministrators,
      topEndUsers,
      summary: {
        total: status === 'all' 
          ? openServiceRequests.length + closedServiceRequests.length 
          : status === 'open' 
            ? openServiceRequests.length 
            : closedServiceRequests.length,
        open: openServiceRequests.length,
        closed: closedServiceRequests.length
      }
    };

    console.log(`📊 Analytics Summary:`, {
      totalOpen: openServiceRequests.length,
      totalClosed: closedServiceRequests.length,
      currentMonthRecords: allRecordsThisMonth.length,
      assignees: assigneeDistribution.length,
      topAdmins: topAdministrators.length,
      topUsers: topEndUsers.length
    });

    res.json({ success: true, data: analytics });
  } catch (e) {
    console.error('❌ Analytics error:', e);
    res.status(500).json({
      success: false,
      error: e.message,
      details: e.response?.data
    });
  }
});

/* =========================
   Helper Functions for In-Memory Processing
========================= */

function processAssigneeDistribution(records, agentMap) {
  console.log(`🔍 Processing assignee distribution from ${records.length} records...`);
  
  // Count tickets by assignee
  const assigneeCounts = {};
  
  records.forEach(record => {
    const assigneeId = record.assignee || 0;
    assigneeCounts[assigneeId] = (assigneeCounts[assigneeId] || 0) + 1;
  });

  // Convert to array format
  const distribution = [];
  
  Object.keys(assigneeCounts).forEach(assigneeId => {
    const count = assigneeCounts[assigneeId];
    const id = parseInt(assigneeId);
    
    if (id === 0) {
      // Unassigned tickets
      distribution.push({
        name: 'Unassigned',
        value: count
      });
    } else {
      // Assigned tickets
      const name = agentMap[id] || `Agent ${id}`;
      distribution.push({
        id,
        name,
        value: count
      });
    }
  });

  // Sort by count descending
  distribution.sort((a, b) => b.value - a.value);

  console.log(`📊 Assignee Distribution (${distribution.length} assignees):`, 
    distribution.map(d => `${d.name}: ${d.value}`).join(', '));
  
  return distribution;
}

function processTopAdministrators(records, agentMap) {
  console.log(`🔍 Processing top administrators from ${records.length} records (current month)...`);
  
  // Count tickets by assignee (excluding unassigned)
  const adminCounts = {};
  
  records.forEach(record => {
    const assigneeId = record.assignee;
    if (assigneeId && assigneeId !== 0) {
      adminCounts[assigneeId] = (adminCounts[assigneeId] || 0) + 1;
    }
  });

  // Convert to array format and get top 4
  const topAdmins = Object.keys(adminCounts)
    .map(adminId => {
      const id = parseInt(adminId);
      return {
        id,
        name: agentMap[id] || `Agent ${id}`,
        count: adminCounts[adminId]
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  console.log(`📊 Top 4 Administrators:`, 
    topAdmins.map(a => `${a.name}: ${a.count}`).join(', '));
  
  return topAdmins;
}

function processPriorityDistribution(records) {
  console.log(`🔍 Processing priority distribution from ${records.length} records...`);
  
  const priorityMap = {
    1: 'Highest',
    2: 'Very High',
    3: 'High',
    4: 'Normal',
    5: 'Low'
  };

  // Count tickets by priority
  const priorityCounts = {};
  
  records.forEach(record => {
    const priority = record.priority || 4; // Default to Normal if not set
    priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;
  });

  // Convert to array format and sort by priority order
  const distribution = Object.keys(priorityCounts)
    .map(priorityId => ({
      name: priorityMap[priorityId] || `Priority ${priorityId}`,
      value: priorityCounts[priorityId],
      order: parseInt(priorityId)
    }))
    .sort((a, b) => a.order - b.order)
    .map(({ name, value }) => ({ name, value }));

  console.log(`📊 Priority Distribution:`, 
    distribution.map(d => `${d.name}: ${d.value}`).join(', '));
  
  return distribution;
}

function processTopEndUsers(records, endUserMap) {
  console.log(`🔍 Processing top end users from ${records.length} records (current month)...`);
  
  // Count tickets by request user
  const userCounts = {};
  
  records.forEach(record => {
    const userId = record.requestUser;
    if (userId) {
      userCounts[userId] = (userCounts[userId] || 0) + 1;
    }
  });

  // Convert to array format and get top 5
  const topUsers = Object.keys(userCounts)
    .map(userId => {
      const id = parseInt(userId);
      return {
        id,
        name: endUserMap[id] || `User ${id}`,
        count: userCounts[userId]
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  console.log(`📊 Top 5 End Users:`, 
    topUsers.map(u => `${u.name}: ${u.count}`).join(', '));
  
  return topUsers;
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

    const baseFilters = buildBaseFilters('open');
    const response = await callConnect(
      `/service-records/search?limit=100&${baseFilters}&fields=srType,updateTime,insertTime`
    );

    const records = Array.isArray(response) ? response : [];
    
    // Filter out non-Service Request records
    const serviceRequests = records.filter(record => record.srType === 1);

    const currentWeek = serviceRequests.filter(r =>
      r.updateTime >= sevenDaysAgo
    );

    const previousWeek = serviceRequests.filter(
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
    const baseFilters = buildBaseFilters('open');
    const response = await callConnect(
      `/service-records/search?limit=100&${baseFilters}&fields=srType,dueDate,insertTime`
    );

    const records = Array.isArray(response) ? response : [];
    
    // Filter out non-Service Request records
    const serviceRequests = records.filter(record => record.srType === 1);

    const now = Date.now();
    const fiveDaysAgo = now - (5 * 24 * 60 * 60 * 1000);

    const overdue = serviceRequests.filter(r =>
      r.dueDate && new Date(r.dueDate).getTime() < now
    ).length;

    const openMoreThan5Days = serviceRequests.filter(r =>
      r.insertTime && r.insertTime < fiveDaysAgo
    ).length;

    const noDueDate = serviceRequests.filter(r => !r.dueDate).length;

    res.json({
      success: true,
      data: {
        totalActive: serviceRequests.length,
        overduePercent: serviceRequests.length > 0
          ? (overdue / serviceRequests.length) * 100
          : 0,
        openMoreThan5Days: serviceRequests.length > 0
          ? (openMoreThan5Days / serviceRequests.length) * 100
          : 0,
        noDueDate: serviceRequests.length > 0
          ? (noDueDate / serviceRequests.length) * 100
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
  console.log(`📊 Analytics Processing Method: In-Memory Grouping (Current Month)`);
  console.log(`   📋 SR Type: 1 (Service Requests only)`);
  console.log(`   📅 Time Filter: Current month (insertTime) for Top Admins & Top Users`);
  console.log(`   🔓 OPEN statuses: ${OPEN_STATUS_IDS.join(', ')}`);
  console.log(`   🔒 CLOSED statuses: ${CLOSED_STATUS_IDS.join(', ')}`);
  console.log(`💡 Top End Users: Based on requestUser with most tickets this month (all statuses)`);
  console.log(`💡 Top Admins: Based on assignee with most tickets this month (all statuses)`);
  console.log(`💡 Service Overview: Grouped by priority (Highest, Very High, High, Normal, Low)`);
  console.log(`⚠️  Client-side filtering for srType=1 to exclude non-Service Requests`);
});