// server/index.js
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const { seedInitialData, db } = require('./db.js');
const { requireAdminAuth } = require('./auth.js');
const realtimeHub = require('./realtime.js');

const publicRoutes = require('./routes/public.js');
const adminRoutes = require('./routes/admin.js');

const PORT = process.env.PORT || 5000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// MIME types mapping for static file serving
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

// Seed initial database state on boot
seedInitialData();

// Helper to parse JSON request body
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      // Protect against gigantic payloads (10MB limit)
      if (body.length > 10 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        resolve({});
      }
    });
    req.on('error', err => reject(err));
  });
}

// Serve static files safely
function serveStaticFile(res, filePath, customHeaders = {}) {
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(PUBLIC_DIR) && !normalized.startsWith(UPLOADS_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/html' });
    return res.end('<h1>403 Forbidden</h1>');
  }

  fs.stat(normalized, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 Not Found</h1>');
      return;
    }

    const ext = path.extname(normalized).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      ...customHeaders
    });

    const stream = fs.createReadStream(normalized);
    stream.pipe(res);
  });
}

// Handle file upload (Base64 or multipart)
function handleFileUpload(req, res) {
  if (!requireAdminAuth(req, res)) return;

  parseJsonBody(req).then(body => {
    const { filename, base64Data, folder } = body;
    if (!filename || !base64Data) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Filename and base64Data are required.' }));
    }

    // Sanitize filename & extension
    const ext = path.extname(filename).toLowerCase();
    const allowedExts = ['.svg', '.png', '.jpg', '.jpeg', '.webp'];
    if (!allowedExts.includes(ext)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Invalid file format. Allowed: SVG, PNG, JPG, WebP.' }));
    }

    const targetFolder = (folder === 'logos') ? path.join(UPLOADS_DIR, 'logos') : path.join(UPLOADS_DIR, 'maps');
    const safeName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    const filePath = path.join(targetFolder, safeName);

    // Strip Base64 header if present
    const base64Clean = base64Data.replace(/^data:[a-zA-Z0-9\/\+]+;base64,/, '');
    const buffer = Buffer.from(base64Clean, 'base64');

    fs.writeFile(filePath, buffer, err => {
      if (err) {
        console.error('[Upload Error]', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Failed to write uploaded file.' }));
      }

      const publicUrl = `/uploads/${folder === 'logos' ? 'logos' : 'maps'}/${safeName}`;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        url: publicUrl,
        filename: safeName
      }));
    });
  }).catch(err => {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: err.message }));
  });
}

// Create Main HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // Basic CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // =================== REALTIME SSE STREAM ===================
  if (pathname === '/api/realtime/events' && method === 'GET') {
    return realtimeHub.handleConnection(req, res);
  }

  // =================== PUBLIC API ROUTES ===================
  if (pathname === '/api/public/map' && method === 'GET') {
    return publicRoutes.handleGetPublicMap(req, res);
  }

  if (pathname === '/api/public/zones' && method === 'GET') {
    return publicRoutes.handleGetPublicZones(req, res);
  }

  if (pathname === '/api/public/stalls' && method === 'GET') {
    return publicRoutes.handleGetPublicStalls(req, res);
  }

  const publicZoneStallsMatch = pathname.match(/^\/api\/public\/zones\/(\d+)\/stalls$/);
  if (publicZoneStallsMatch && method === 'GET') {
    return publicRoutes.handleGetPublicZoneStalls(req, res, Number(publicZoneStallsMatch[1]));
  }

  if (pathname === '/api/public/search' && method === 'GET') {
    return publicRoutes.handlePublicSearch(req, res, parsedUrl.query.q);
  }

  // =================== ADMIN API ROUTES ===================
  // Auth
  if (pathname === '/api/admin/auth/login' && method === 'POST') {
    const body = await parseJsonBody(req);
    return adminRoutes.handleLogin(req, res, body);
  }

  if (pathname === '/api/admin/auth/logout' && method === 'POST') {
    return adminRoutes.handleLogout(req, res);
  }

  if (pathname === '/api/admin/auth/me' && method === 'GET') {
    if (!requireAdminAuth(req, res)) return;
    return adminRoutes.handleGetMe(req, res);
  }

  if (pathname === '/api/admin/auth/password' && method === 'PUT') {
    if (!requireAdminAuth(req, res)) return;
    const body = await parseJsonBody(req);
    return adminRoutes.handleChangePassword(req, res, body);
  }

  // Stats
  if (pathname === '/api/admin/stats' && method === 'GET') {
    if (!requireAdminAuth(req, res)) return;
    return adminRoutes.handleGetStats(req, res);
  }

  // Upload
  if (pathname === '/api/admin/upload' && method === 'POST') {
    return handleFileUpload(req, res);
  }

  // Maps
  if (pathname === '/api/admin/maps' && method === 'GET') {
    if (!requireAdminAuth(req, res)) return;
    return adminRoutes.handleGetMaps(req, res);
  }

  if (pathname === '/api/admin/maps' && method === 'POST') {
    if (!requireAdminAuth(req, res)) return;
    const body = await parseJsonBody(req);
    return adminRoutes.handleCreateMap(req, res, body);
  }

  const activateMapMatch = pathname.match(/^\/api\/admin\/maps\/(\d+)\/activate$/);
  if (activateMapMatch && method === 'PUT') {
    if (!requireAdminAuth(req, res)) return;
    return adminRoutes.handleActivateMap(req, res, Number(activateMapMatch[1]));
  }

  // Zones
  if (pathname === '/api/admin/zones' && method === 'GET') {
    if (!requireAdminAuth(req, res)) return;
    return adminRoutes.handleGetZones(req, res);
  }

  if (pathname === '/api/admin/zones' && method === 'POST') {
    if (!requireAdminAuth(req, res)) return;
    const body = await parseJsonBody(req);
    return adminRoutes.handleCreateZone(req, res, body);
  }

  const zoneIdMatch = pathname.match(/^\/api\/admin\/zones\/(\d+)$/);
  if (zoneIdMatch) {
    const zoneId = Number(zoneIdMatch[1]);
    if (!requireAdminAuth(req, res)) return;

    if (method === 'PUT') {
      const body = await parseJsonBody(req);
      return adminRoutes.handleUpdateZone(req, res, zoneId, body);
    }
    if (method === 'DELETE') {
      return adminRoutes.handleDeleteZone(req, res, zoneId);
    }
  }

  const duplicateZoneMatch = pathname.match(/^\/api\/admin\/zones\/(\d+)\/duplicate$/);
  if (duplicateZoneMatch && method === 'POST') {
    if (!requireAdminAuth(req, res)) return;
    return adminRoutes.handleDuplicateZone(req, res, Number(duplicateZoneMatch[1]));
  }

  // Stalls
  if (pathname === '/api/admin/stalls' && method === 'GET') {
    if (!requireAdminAuth(req, res)) return;
    return adminRoutes.handleGetStalls(req, res, parsedUrl.query);
  }

  if (pathname === '/api/admin/stalls' && method === 'POST') {
    if (!requireAdminAuth(req, res)) return;
    const body = await parseJsonBody(req);
    return adminRoutes.handleCreateStall(req, res, body);
  }

  const duplicateStallMatch = pathname.match(/^\/api\/admin\/stalls\/(\d+)\/duplicate$/);
  if (duplicateStallMatch && method === 'POST') {
    if (!requireAdminAuth(req, res)) return;
    return adminRoutes.handleDuplicateStall(req, res, Number(duplicateStallMatch[1]));
  }

  if (pathname === '/api/admin/stalls/import' && method === 'POST') {
    if (!requireAdminAuth(req, res)) return;
    const body = await parseJsonBody(req);
    return adminRoutes.handleImportStallsCSV(req, res, body);
  }

  if (pathname === '/api/admin/stalls/export' && method === 'GET') {
    if (!requireAdminAuth(req, res)) return;
    return adminRoutes.handleExportStallsCSV(req, res);
  }

  const stallIdMatch = pathname.match(/^\/api\/admin\/stalls\/(\d+)$/);
  if (stallIdMatch) {
    const stallId = Number(stallIdMatch[1]);
    if (!requireAdminAuth(req, res)) return;

    if (method === 'PUT') {
      const body = await parseJsonBody(req);
      return adminRoutes.handleUpdateStall(req, res, stallId, body);
    }
    if (method === 'DELETE') {
      return adminRoutes.handleDeleteStall(req, res, stallId);
    }
  }

  // Audit logs
  if (pathname === '/api/admin/audit-logs' && method === 'GET') {
    if (!requireAdminAuth(req, res)) return;
    return adminRoutes.handleGetAuditLogs(req, res);
  }

  // =================== STATIC FILES & SPA ROUTES ===================
  // Uploaded files
  if (pathname.startsWith('/uploads/')) {
    const relativePath = pathname.replace(/^\/uploads\//, '');
    const filePath = path.join(UPLOADS_DIR, relativePath);
    return serveStaticFile(res, filePath);
  }

  // Assets and public static files
  let staticPath = path.join(PUBLIC_DIR, pathname);

  // Friendly Route mapping
  if (pathname === '/' || pathname === '/map' || pathname === '/stalls') {
    staticPath = path.join(PUBLIC_DIR, 'index.html');
  } else if (pathname === '/admin' || pathname === '/admin/dashboard' || pathname === '/admin/editor') {
    staticPath = path.join(PUBLIC_DIR, 'admin.html');
  } else if (pathname === '/login' || pathname === '/admin/login') {
    staticPath = path.join(PUBLIC_DIR, 'login.html');
  }

  serveStaticFile(res, staticPath);
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Interactive Stall Management System is Running!`);
  console.log(`🌐 Public Map URL:      http://localhost:${PORT}/map`);
  console.log(`🔒 Admin Dashboard:     http://localhost:${PORT}/admin`);
  console.log(`🔑 Default Admin Login: admin@event.com / Admin@123456`);
  console.log(`====================================================`);
});
