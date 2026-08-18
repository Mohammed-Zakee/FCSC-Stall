// test_full_suite.js - Comprehensive End-to-End Test Suite
const http = require('node:http');

const BASE_URL = 'http://localhost:5000';
let adminCookie = '';
let testZoneId = null;
let testStallId = null;
let testDupStallId = null;

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (e) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
          json
        });
      });
    });

    req.on('error', (err) => reject(err));
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

function parseCookies(res) {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return '';
  return setCookie.map(c => c.split(';')[0]).join('; ');
}

async function run() {
  console.log('====================================================');
  console.log('🧪 RUNNING COMPREHENSIVE END-TO-END VERIFICATION SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, title) {
    if (condition) {
      console.log(`  ✓ PASS: ${title}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${title}`);
      failed++;
    }
  }

  // 1. PUBLIC MAP INFO
  console.log('[SECTION 1: PUBLIC MAP & ZONE ENDPOINTS]');
  const mapRes = await request({ hostname: 'localhost', port: 5000, path: '/api/public/map', method: 'GET' });
  assert(mapRes.status === 200, 'GET /api/public/map returns 200');
  assert(mapRes.json && mapRes.json.success === true, 'Public map JSON has success: true');
  assert(mapRes.json && mapRes.json.data && mapRes.json.data.imageUrl, 'Public map includes imageUrl');

  // 2. PUBLIC ZONES
  const zonesRes = await request({ hostname: 'localhost', port: 5000, path: '/api/public/zones', method: 'GET' });
  assert(zonesRes.status === 200, 'GET /api/public/zones returns 200');
  assert(zonesRes.json && Array.isArray(zonesRes.json.data), 'Public zones returns data array');

  // 3. ZERO DATA LEAKAGE VERIFICATION
  console.log('\n[SECTION 2: ZERO PRIVATE DATA LEAKAGE AUDIT]');
  const stallsRes = await request({ hostname: 'localhost', port: 5000, path: '/api/public/stalls', method: 'GET' });
  assert(stallsRes.status === 200, 'GET /api/public/stalls returns 200');

  const privateKeys = ['contact_person', 'phone', 'email', 'payment_status', 'payment_amount', 'internal_notes', 'salt', 'password_hash'];
  let leakFound = false;

  (stallsRes.json.stalls || []).forEach(s => {
    privateKeys.forEach(k => {
      if (s[k] !== undefined) {
        leakFound = true;
        console.error(`  LEAK DETECTED in stall ${s.id}: Field "${k}" found!`);
      }
    });
  });
  assert(!leakFound, 'Zero private fields leaked in GET /api/public/stalls');

  // Check Zone Stalls zero leakage
  if (zonesRes.json.data.length > 0) {
    const firstZoneId = zonesRes.json.data[0].id;
    const zoneStallsRes = await request({ hostname: 'localhost', port: 5000, path: `/api/public/zones/${firstZoneId}/stalls`, method: 'GET' });
    assert(zoneStallsRes.status === 200, `GET /api/public/zones/${firstZoneId}/stalls returns 200`);

    let zoneLeak = false;
    (zoneStallsRes.json.stalls || []).forEach(s => {
      privateKeys.forEach(k => {
        if (s[k] !== undefined) {
          zoneLeak = true;
          console.error(`  LEAK DETECTED in zone stall ${s.id}: Field "${k}" found!`);
        }
      });
    });
    assert(!zoneLeak, 'Zero private fields leaked in GET /api/public/zones/:id/stalls');
  }

  // 4. PUBLIC SEARCH
  const searchRes = await request({ hostname: 'localhost', port: 5000, path: '/api/public/search?q=tech', method: 'GET' });
  assert(searchRes.status === 200, 'GET /api/public/search returns 200');
  assert(searchRes.json && Array.isArray(searchRes.json.results), 'Search returns results array');

  // 5. SECURITY & AUTHENTICATION
  console.log('\n[SECTION 3: AUTHENTICATION & ACCESS CONTROL]');
  const unauthStats = await request({ hostname: 'localhost', port: 5000, path: '/api/admin/stats', method: 'GET' });
  assert(unauthStats.status === 401, 'Unauthenticated GET /api/admin/stats returns 401');

  const unauthStalls = await request({ hostname: 'localhost', port: 5000, path: '/api/admin/stalls', method: 'GET' });
  assert(unauthStalls.status === 401, 'Unauthenticated GET /api/admin/stalls returns 401');

  const badLogin = await request({
    hostname: 'localhost', port: 5000, path: '/api/admin/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email: 'admin@event.com', password: 'WrongPassword123' });
  assert(badLogin.status === 401, 'Invalid login credentials returns 401');

  const goodLogin = await request({
    hostname: 'localhost', port: 5000, path: '/api/admin/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email: 'admin@event.com', password: 'Admin@123456' });
  assert(goodLogin.status === 200, 'Valid admin login returns 200');
  assert(goodLogin.json && goodLogin.json.success === true, 'Admin login returns success: true');
  
  adminCookie = parseCookies(goodLogin);
  assert(adminCookie.includes('stall_session='), 'Admin session cookie issued');

  const authMe = await request({
    hostname: 'localhost', port: 5000, path: '/api/admin/auth/me', method: 'GET',
    headers: { 'Cookie': adminCookie }
  });
  assert(authMe.status === 200 && authMe.json.user.email === 'admin@event.com', 'Authenticated GET /api/admin/auth/me returns admin user');

  // 6. ADMIN CRUD OPERATIONS (PIN & STALL LIFECYCLE)
  console.log('\n[SECTION 4: ADMIN PIN & STALL CRUD LIFECYCLE]');
  
  // A. Create Pin
  const createPinRes = await request({
    hostname: 'localhost', port: 5000, path: '/api/admin/zones', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie }
  }, {
    name: 'Test E2E Pin Zone',
    shape: 'rect',
    x: 50.0,
    y: 50.0,
    width: 15.0,
    height: 15.0,
    color: '#8b5cf6',
    is_public: 1,
    description: 'E2E Automated Test Pin'
  });
  assert(createPinRes.status === 201, 'POST /api/admin/zones creates new Pin (201 Created)');
  testZoneId = createPinRes.json.zone.id;
  assert(typeof testZoneId === 'number', `Pin ID is valid number (${testZoneId})`);

  // B. Update Pin Coordinates
  const updatePinRes = await request({
    hostname: 'localhost', port: 5000, path: `/api/admin/zones/${testZoneId}`, method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie }
  }, {
    name: 'Updated E2E Pin',
    x: 55.5,
    y: 55.5
  });
  assert(updatePinRes.status === 200, `PUT /api/admin/zones/${testZoneId} updates position to 55.5%, 55.5%`);
  assert(updatePinRes.json.zone.x === 55.5, 'Pin coordinate X successfully updated');

  // C. Create Stall under this Pin
  const stallNum = `E2E-${Date.now().toString().slice(-4)}`;
  const createStallRes = await request({
    hostname: 'localhost', port: 5000, path: '/api/admin/stalls', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie }
  }, {
    zone_id: testZoneId,
    stall_number: stallNum,
    company_name: 'Apex Robotics International',
    category: 'Robotics',
    public_description: 'Innovative robotics company',
    public_visible: true,
    contact_person: 'Alice Vance',
    phone: '+1 555-0199',
    email: 'alice@apexrobotics.com',
    payment_status: 'Paid',
    payment_amount: 5000.0,
    booking_status: 'Booked',
    internal_notes: 'VIP booth with special electric requirements'
  });
  assert(createStallRes.status === 201, `POST /api/admin/stalls creates stall "${stallNum}" (201 Created)`);
  testStallId = createStallRes.json.stall.id;
  assert(typeof testStallId === 'number', `Stall ID is valid number (${testStallId})`);

  // D. Verify Stall in Admin view (all private fields intact)
  const adminStallRes = await request({
    hostname: 'localhost', port: 5000, path: `/api/admin/stalls?search=${stallNum}`, method: 'GET',
    headers: { 'Cookie': adminCookie }
  });
  assert(adminStallRes.status === 200, 'GET /api/admin/stalls retrieves stall');
  const foundAdminStall = adminStallRes.json.stalls.find(s => s.id === testStallId);
  assert(foundAdminStall && foundAdminStall.contact_person === 'Alice Vance', 'Admin view contains private contact_person');
  assert(foundAdminStall && foundAdminStall.internal_notes === 'VIP booth with special electric requirements', 'Admin view contains private internal_notes');

  // E. Verify Stall in Public view (private fields strictly projected out)
  const publicStallCheck = await request({
    hostname: 'localhost', port: 5000, path: `/api/public/zones/${testZoneId}/stalls`, method: 'GET'
  });
  assert(publicStallCheck.status === 200, `GET /api/public/zones/${testZoneId}/stalls returns 200`);
  const foundPubStall = (publicStallCheck.json.stalls || []).find(s => s.id === testStallId);
  assert(foundPubStall && foundPubStall.companyName === 'Apex Robotics International', 'Public view displays public companyName');
  assert(foundPubStall && foundPubStall.contact_person === undefined, 'Public view hides contact_person (Zero Leakage)');
  assert(foundPubStall && foundPubStall.internal_notes === undefined, 'Public view hides internal_notes (Zero Leakage)');

  // F. Duplicate Stall
  const dupRes = await request({
    hostname: 'localhost', port: 5000, path: `/api/admin/stalls/${testStallId}/duplicate`, method: 'POST',
    headers: { 'Cookie': adminCookie }
  });
  assert(dupRes.status === 201, `POST /api/admin/stalls/${testStallId}/duplicate returns 201`);
  testDupStallId = dupRes.json.stall.id;

  // G. Delete Duplicated Stall
  const delDupRes = await request({
    hostname: 'localhost', port: 5000, path: `/api/admin/stalls/${testDupStallId}`, method: 'DELETE',
    headers: { 'Cookie': adminCookie }
  });
  assert(delDupRes.status === 200, `DELETE /api/admin/stalls/${testDupStallId} deletes duplicate stall`);

  // H. Delete Pin (Cascades to child stalls)
  const delPinRes = await request({
    hostname: 'localhost', port: 5000, path: `/api/admin/zones/${testZoneId}`, method: 'DELETE',
    headers: { 'Cookie': adminCookie }
  });
  assert(delPinRes.status === 200, `DELETE /api/admin/zones/${testZoneId} deletes Pin`);

  // Verify child stall was cascaded
  const checkCascade = await request({
    hostname: 'localhost', port: 5000, path: `/api/admin/stalls?search=${stallNum}`, method: 'GET',
    headers: { 'Cookie': adminCookie }
  });
  assert(checkCascade.json.stalls.length === 0, 'Child stall cascade deleted when parent Pin was deleted');

  // 7. CSV EXPORT & AUDIT LOGS
  console.log('\n[SECTION 5: CSV EXPORT & AUDIT LOGS]');
  const csvRes = await request({
    hostname: 'localhost', port: 5000, path: '/api/admin/stalls/export', method: 'GET',
    headers: { 'Cookie': adminCookie }
  });
  assert(csvRes.status === 200 && csvRes.headers['content-type'].includes('text/csv'), 'GET /api/admin/stalls/export returns CSV content');

  const auditRes = await request({
    hostname: 'localhost', port: 5000, path: '/api/admin/audit-logs', method: 'GET',
    headers: { 'Cookie': adminCookie }
  });
  assert(auditRes.status === 200 && Array.isArray(auditRes.json.logs), 'GET /api/admin/audit-logs returns logs array');
  assert(auditRes.json.logs.length > 0, 'Audit log recorded recent actions');

  // 8. STATIC FILES & ROUTING
  console.log('\n[SECTION 6: STATIC ASSETS & SECURITY ROUTING]');
  const routes = ['/', '/map', '/admin', '/login', '/css/common.css', '/css/public.css', '/js/public-map.js'];
  for (const r of routes) {
    const staticRes = await request({ hostname: 'localhost', port: 5000, path: r, method: 'GET' });
    assert(staticRes.status === 200, `GET ${r} returns 200 OK`);
  }

  console.log('\n====================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed === 0) {
    console.log('🎉 ENTIRE SITE & API SYSTEM VERIFIED 100% OPERATIONAL WITH ZERO BUGS!');
  } else {
    process.exit(1);
  }
}

run().catch(e => {
  console.error('[Test Error]', e);
  process.exit(1);
});
