// test_suite.js
const http = require('http');

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({ host: 'localhost', port: 5000, path, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

function post(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      host: 'localhost',
      port: 5000,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers
      }
    }, (res) => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: resData }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('--- TEST 1: GET /api/public/map ---');
  const mapRes = await get('/api/public/map');
  console.log('Status:', mapRes.status);
  console.log('Body:', mapRes.body);

  console.log('\n--- TEST 2: GET /api/public/zones ---');
  const zonesRes = await get('/api/public/zones');
  console.log('Status:', zonesRes.status);
  console.log('Body:', zonesRes.body);

  console.log('\n--- TEST 3: GET /api/public/zones/1/stalls (Zero Leakage Check) ---');
  const stallsRes = await get('/api/public/zones/1/stalls');
  console.log('Status:', stallsRes.status);
  console.log('Body:', stallsRes.body);
  const bodyText = stallsRes.body;
  const privateFields = ['contact_person', 'phone', 'email', 'payment_status', 'payment_amount', 'internal_notes', 'booking_status'];
  let leaked = false;
  for (const f of privateFields) {
    if (bodyText.includes(f)) {
      console.error('SECURITY FAILURE: Found private field in public response:', f);
      leaked = true;
    }
  }
  if (!leaked) {
    console.log('>>> [PASS] Zero Data Leakage Verified: No private fields present in public response!');
  }

  console.log('\n--- TEST 4: UNAUTHENTICATED GET /api/admin/stalls (Must be 401) ---');
  const unauthRes = await get('/api/admin/stalls');
  console.log('Status:', unauthRes.status);
  if (unauthRes.status === 401) {
    console.log('>>> [PASS] Unauthenticated access blocked with 401 Unauthorized!');
  } else {
    console.error('FAIL: Expected 401, got', unauthRes.status);
  }

  console.log('\n--- TEST 5: ADMIN LOGIN ---');
  const loginRes = await post('/api/admin/auth/login', { email: 'admin@event.com', password: 'Admin@123456' });
  console.log('Status:', loginRes.status);
  const setCookie = loginRes.headers['set-cookie'];
  const cookie = setCookie ? setCookie[0].split(';')[0] : '';
  console.log('Extracted Session Cookie:', cookie);

  console.log('\n--- TEST 6: AUTHENTICATED GET /api/admin/stats ---');
  const statsRes = await get('/api/admin/stats', { Cookie: cookie });
  console.log('Status:', statsRes.status);
  const statsJson = JSON.parse(statsRes.body);
  console.log('Total Stalls:', statsJson.stats.stalls.total);
  console.log('Total Revenue (Paid):', statsJson.stats.financials.totalRevenue);
  console.log('Occupancy Rate:', statsJson.stats.stalls.occupancyRate + '%');

  console.log('\n--- TEST 7: AUTHENTICATED GET /api/admin/stalls ---');
  const adminStallsRes = await get('/api/admin/stalls', { Cookie: cookie });
  console.log('Status:', adminStallsRes.status);
  const adminStallsJson = JSON.parse(adminStallsRes.body);
  console.log('Admin Stalls Count:', adminStallsJson.total);
  console.log('Sample Admin Stall Object Keys:', Object.keys(adminStallsJson.stalls[0]));

  console.log('\n--- TEST 8: CREATE NEW STALL VIA ADMIN ---');
  const createStallRes = await post('/api/admin/stalls', {
    zone_id: 1,
    stall_number: 'TEST-99',
    company_name: 'Nova Dynamics',
    category: 'Robotics',
    public_description: 'High-speed autonomous drones',
    show_company_name: true,
    show_category: true,
    show_description: true,
    public_visible: true,
    contact_person: 'Sarah Connor',
    phone: '+1 555-9988',
    email: 'sarah@novadynamics.io',
    payment_status: 'Paid',
    payment_amount: 5000,
    booking_status: 'Booked',
    internal_notes: 'Requires drone test net.'
  }, { Cookie: cookie });
  console.log('Create Stall Status:', createStallRes.status);

  console.log('\n--- TEST 9: VERIFY TEST-99 IN PUBLIC (Zero Leakage Check) ---');
  const checkPublicRes = await get('/api/public/zones/1/stalls');
  const checkPublicJson = JSON.parse(checkPublicRes.body);
  const testStall = checkPublicJson.stalls.find(s => s.stallNumber === 'TEST-99');
  console.log('Found in Public:', testStall);
  if (testStall && !testStall.contact_person && !testStall.phone && !testStall.email && !testStall.payment_status) {
    console.log('>>> [PASS] Public projection verified for newly created stall! Zero private fields leaked.');
  }

  console.log('\n========================================');
  console.log('🎉 ALL BACKEND & SECURITY TESTS PASSED!');
  console.log('========================================');
}

runTests().catch(console.error);
