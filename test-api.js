const axios = require('axios');

const BACKEND_URL = 'http://localhost:3000';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function testEndpoint(name, endpoint) {
  try {
    log(`\n🧪 Testing: ${name}`, colors.blue);
    log(`   Endpoint: ${endpoint}`, colors.yellow);
    
    const startTime = Date.now();
    const response = await axios.get(`${BACKEND_URL}${endpoint}`);
    const duration = Date.now() - startTime;
    
    if (response.data.success !== false) {
      log(`✅ PASS (${duration}ms)`, colors.green);
      
      // Show sample of data
      const data = response.data.data || response.data;
      if (Array.isArray(data)) {
        log(`   Returned ${data.length} items`, colors.reset);
        if (data.length > 0) {
          log(`   Sample: ${JSON.stringify(data[0], null, 2).substring(0, 200)}...`, colors.reset);
        }
      } else if (typeof data === 'object') {
        log(`   Data: ${JSON.stringify(data, null, 2).substring(0, 300)}...`, colors.reset);
      }
      
      return true;
    } else {
      log(`❌ FAIL - Response indicated failure`, colors.red);
      log(`   Error: ${response.data.error}`, colors.red);
      return false;
    }
  } catch (error) {
    log(`❌ FAIL`, colors.red);
    if (error.response) {
      log(`   Status: ${error.response.status}`, colors.red);
      log(`   Error: ${JSON.stringify(error.response.data, null, 2)}`, colors.red);
    } else if (error.request) {
      log(`   No response received - is the server running?`, colors.red);
    } else {
      log(`   Error: ${error.message}`, colors.red);
    }
    return false;
  }
}

async function runTests() {
  log('='.repeat(60), colors.blue);
  log('SysAid Backend Proxy - API Tests', colors.blue);
  log('='.repeat(60), colors.blue);
  
  const tests = [
    ['Health Check', '/api/health'],
    ['Weekly Metrics', '/api/metrics/weekly'],
    ['Active Tickets', '/api/tickets/active'],
    ['Detailed Tickets (limit 5)', '/api/tickets/detailed?limit=5'],
    ['All Tickets (limit 10)', '/api/tickets?limit=10'],
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const [name, endpoint] of tests) {
    const result = await testEndpoint(name, endpoint);
    if (result) {
      passed++;
    } else {
      failed++;
    }
  }
  
  log('\n' + '='.repeat(60), colors.blue);
  log('Test Results', colors.blue);
  log('='.repeat(60), colors.blue);
  log(`✅ Passed: ${passed}`, colors.green);
  log(`❌ Failed: ${failed}`, colors.red);
  log(`📊 Total:  ${passed + failed}`, colors.blue);
  
  if (failed === 0) {
    log('\n🎉 All tests passed! Backend is working correctly.', colors.green);
  } else {
    log('\n⚠️  Some tests failed. Check the errors above.', colors.yellow);
  }
}

// Run tests
log('\n🚀 Starting backend API tests...', colors.blue);
log(`📍 Backend URL: ${BACKEND_URL}\n`, colors.yellow);

runTests().catch(error => {
  log(`\n💥 Test suite failed: ${error.message}`, colors.red);
  process.exit(1);
});
