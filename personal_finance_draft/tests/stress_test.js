const http = require('http');

const endpoints = [
  '/api/status',
  '/api/cache/universe',
  '/api/indicators'
];

const CONCURRENCY = 50;
const HOST = '127.0.0.1';
const PORT = 8787;

async function makeRequest(path) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.get({
      hostname: HOST,
      port: PORT,
      path: path,
      timeout: 5000
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          path,
          status: res.statusCode,
          duration: Date.now() - start,
          ok: res.statusCode >= 200 && res.statusCode < 300
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        path,
        status: 'ERROR',
        error: err.message,
        duration: Date.now() - start,
        ok: false
      });
    });
  });
}

async function runTest() {
  console.log(`Starting stress test: ${CONCURRENCY} concurrent requests per endpoint...`);
  
  const results = {};
  
  for (const endpoint of endpoints) {
    console.log(`Testing ${endpoint}...`);
    const promises = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      promises.push(makeRequest(endpoint));
    }
    
    const endpointResults = await Promise.all(promises);
    results[endpoint] = {
      success: endpointResults.filter(r => r.ok).length,
      failed: endpointResults.filter(r => !r.ok).length,
      avgDuration: endpointResults.reduce((acc, r) => acc + r.duration, 0) / CONCURRENCY,
      statuses: [...new Set(endpointResults.map(r => r.status))]
    };
  }

  console.log('Stress Test Results:');
  console.log(JSON.stringify(results, null, 2));
}

runTest().catch(console.error);
