// server/routes/admin.js - Bulletproof Admin Routes
const { db, hashPassword, verifyPassword } = require('../db.js');
const { createSession, destroySession, getClearCookieHeader, parseCookies, SESSION_COOKIE_NAME } = require('../auth.js');
const realtimeHub = require('../realtime.js');

// Utility to write JSON response
function sendJson(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    ...headers
  });
  res.end(JSON.stringify(data));
}

// Log admin action into audit_logs table
function recordAudit(req, action, entityType, entityId, details) {
  try {
    const user = req.user || { id: null, name: 'System' };
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    db.prepare(`
      INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?);
    `).run(user.id, user.name, action, entityType, String(entityId || ''), details, String(ip));
  } catch (e) {
    console.error('[Audit Log Error]', e);
  }
}

// Helper to broadcast changes to both public and admin realtime channels
function broadcastZoneChange(action, zoneId) {
  try {
    const adminZone = db.prepare(`
      SELECT z.*, COUNT(s.id) AS total_stalls,
             COUNT(CASE WHEN s.booking_status = 'Booked' THEN 1 END) AS booked_stalls
      FROM zones z
      LEFT JOIN stalls s ON z.id = s.zone_id
      WHERE z.id = ?
      GROUP BY z.id;
    `).get(zoneId);

    if (action === 'DELETE') {
      realtimeHub.broadcast('ZONE_DELETED', { id: zoneId }, { id: zoneId });
      return;
    }

    if (!adminZone) return;

    let publicPayload = null;
    if (adminZone.is_public === 1) {
      publicPayload = {
        id: adminZone.id,
        name: adminZone.name,
        shape: adminZone.shape,
        x: adminZone.x,
        y: adminZone.y,
        width: adminZone.width,
        height: adminZone.height,
        rotation: adminZone.rotation,
        color: adminZone.color,
        description: adminZone.description || '',
        stallCount: adminZone.total_stalls
      };
    }

    realtimeHub.broadcast(
      action === 'CREATE' ? 'ZONE_CREATED' : 'ZONE_UPDATED',
      adminZone.is_public === 1 ? publicPayload : { id: zoneId, deleted: true },
      adminZone
    );
  } catch (err) {
    console.error('[Broadcast Error]', err);
  }
}

function broadcastStallChange(action, stallId, zoneId) {
  try {
    if (action === 'DELETE') {
      realtimeHub.broadcast('STALL_DELETED', { id: stallId, stallId, zoneId }, { id: stallId, stallId, zoneId });
      return;
    }

    const adminStall = db.prepare(`
      SELECT s.*, z.name AS zone_name, z.color AS zone_color, z.is_public AS zone_is_public
      FROM stalls s
      LEFT JOIN zones z ON s.zone_id = z.id
      WHERE s.id = ?;
    `).get(stallId);

    if (!adminStall) return;

    let publicPayload = null;
    if (adminStall.public_visible === 1 && adminStall.zone_is_public === 1) {
      publicPayload = {
        id: adminStall.id,
        zoneId: adminStall.zone_id,
        zoneName: adminStall.zone_name,
        stallNumber: adminStall.stall_number,
        x: adminStall.x,
        y: adminStall.y,
        width: adminStall.width || 6.5,
        height: adminStall.height || 6.5,
        shape: adminStall.shape || 'rect',
        color: adminStall.color || adminStall.zone_color || '#3b82f6',
        isAvailable: adminStall.booking_status === 'Available'
      };
      if (adminStall.show_company_name && adminStall.company_name) {
        publicPayload.companyName = adminStall.company_name;
      }
      if (adminStall.show_category && adminStall.category) {
        publicPayload.category = adminStall.category;
      }
      if (adminStall.show_description && adminStall.public_description) {
        publicPayload.description = adminStall.public_description;
      }
      if (adminStall.show_logo && adminStall.public_logo) {
        publicPayload.logo = adminStall.public_logo;
      }
    }

    realtimeHub.broadcast(
      action === 'CREATE' ? 'STALL_CREATED' : 'STALL_UPDATED',
      publicPayload || { id: stallId, stallNumber: adminStall.stall_number, zoneId, removed: true },
      adminStall
    );
  } catch (err) {
    console.error('[Broadcast Stall Error]', err);
  }
}

// ----------------- AUTH HANDLERS -----------------
function handleLogin(req, res, body) {
  try {
    const { email, password } = body;
    if (!email || !password) {
      return sendJson(res, 400, { success: false, error: 'Email and password are required.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ? LIMIT 1;').get(email.trim().toLowerCase());
    if (!user) {
      return sendJson(res, 401, { success: false, error: 'Invalid email or password.' });
    }

    const isValid = verifyPassword(password, user.password_hash, user.salt);
    if (!isValid) {
      return sendJson(res, 401, { success: false, error: 'Invalid email or password.' });
    }

    const { token, cookieHeader } = createSession(user.id);
    req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    recordAudit(req, 'LOGIN', 'AUTH', user.id, `User logged in from ${req.socket.remoteAddress || '127.0.0.1'}`);

    sendJson(res, 200, {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    }, { 'Set-Cookie': cookieHeader });
  } catch (err) {
    console.error('[Admin Login Error]', err);
    sendJson(res, 500, { success: false, error: 'Internal server error during login.' });
  }
}

function handleLogout(req, res) {
  try {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE_NAME];
    if (token) {
      destroySession(token);
    }
    if (req.user) {
      recordAudit(req, 'LOGOUT', 'AUTH', req.user.id, 'User logged out');
    }

    sendJson(res, 200, {
      success: true,
      message: 'Logged out successfully.'
    }, { 'Set-Cookie': getClearCookieHeader() });
  } catch (err) {
    console.error('[Admin Logout Error]', err);
    sendJson(res, 500, { success: false, error: 'Error during logout.' });
  }
}

function handleGetMe(req, res) {
  sendJson(res, 200, {
    success: true,
    user: req.user
  });
}

function handleChangePassword(req, res, body) {
  try {
    const { currentPassword, newPassword } = body;
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return sendJson(res, 400, { success: false, error: 'New password must be at least 6 characters.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?;').get(req.user.id);
    if (!user || !verifyPassword(currentPassword, user.password_hash, user.salt)) {
      return sendJson(res, 400, { success: false, error: 'Current password is incorrect.' });
    }

    const { hash, salt } = hashPassword(newPassword);
    db.prepare(`
      UPDATE users SET password_hash = ?, salt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;
    `).run(hash, salt, req.user.id);

    recordAudit(req, 'UPDATE', 'AUTH', req.user.id, 'Password changed successfully');
    sendJson(res, 200, { success: true, message: 'Password updated successfully.' });
  } catch (err) {
    console.error('[Change Password Error]', err);
    sendJson(res, 500, { success: false, error: 'Failed to update password.' });
  }
}

// ----------------- DASHBOARD STATS -----------------
function handleGetStats(req, res) {
  try {
    const totalZones = db.prepare('SELECT COUNT(*) as count FROM zones;').get().count;
    const publicZones = db.prepare('SELECT COUNT(*) as count FROM zones WHERE is_public = 1;').get().count;

    const stallStats = db.prepare(`
      SELECT 
        COUNT(*) AS total_stalls,
        COUNT(CASE WHEN booking_status = 'Booked' THEN 1 END) AS booked,
        COUNT(CASE WHEN booking_status = 'Available' THEN 1 END) AS available,
        COUNT(CASE WHEN booking_status = 'Reserved' THEN 1 END) AS reserved,
        COUNT(CASE WHEN payment_status = 'Paid' THEN 1 END) AS paid,
        COUNT(CASE WHEN payment_status = 'Pending' THEN 1 END) AS pending,
        COUNT(CASE WHEN payment_status = 'Unpaid' THEN 1 END) AS unpaid,
        COUNT(CASE WHEN public_visible = 1 THEN 1 END) AS public_visible,
        TOTAL(CASE WHEN payment_status = 'Paid' THEN payment_amount ELSE 0 END) AS total_revenue,
        TOTAL(payment_amount) AS potential_revenue
      FROM stalls;
    `).get();

    const recentLogs = db.prepare(`
      SELECT id, user_name, action, entity_type, entity_id, details, created_at
      FROM audit_logs
      ORDER BY id DESC
      LIMIT 6;
    `).all();

    const rtStats = realtimeHub.getStats();

    sendJson(res, 200, {
      success: true,
      stats: {
        zones: {
          total: totalZones,
          public: publicZones,
          private: totalZones - publicZones
        },
        stalls: {
          total: stallStats.total_stalls,
          booked: stallStats.booked,
          available: stallStats.available,
          reserved: stallStats.reserved,
          paid: stallStats.paid,
          pending: stallStats.pending,
          unpaid: stallStats.unpaid,
          publicVisible: stallStats.public_visible,
          occupancyRate: stallStats.total_stalls > 0 ? Math.round((stallStats.booked / stallStats.total_stalls) * 100) : 0
        },
        financials: {
          totalRevenue: stallStats.total_revenue,
          potentialRevenue: stallStats.potential_revenue
        },
        realtime: rtStats,
        recentActivity: recentLogs
      }
    });
  } catch (err) {
    console.error('[Admin Stats Error]', err);
    sendJson(res, 500, { success: false, error: 'Failed to retrieve stats.' });
  }
}

// ----------------- MAPS MANAGEMENT -----------------
function handleGetMaps(req, res) {
  try {
    const maps = db.prepare(`
      SELECT m.*, COUNT(z.id) as zone_count
      FROM maps m
      LEFT JOIN zones z ON m.id = z.map_id
      GROUP BY m.id
      ORDER BY m.id DESC;
    `).all();
    sendJson(res, 200, { success: true, maps });
  } catch (err) {
    console.error('[Get Maps Error]', err);
    sendJson(res, 500, { success: false, error: 'Failed to retrieve maps.' });
  }
}

function handleCreateMap(req, res, body) {
  try {
    const { name, imageUrl, width, height } = body;
    if (!name || !imageUrl) {
      return sendJson(res, 400, { success: false, error: 'Map name and image are required.' });
    }

    db.prepare('UPDATE maps SET is_active = 0;').run();

    const maxVersion = db.prepare('SELECT MAX(version) as max_v FROM maps;').get().max_v || 0;
    const version = maxVersion + 1;

    const result = db.prepare(`
      INSERT INTO maps (name, image_url, version, is_active, width, height)
      VALUES (?, ?, ?, 1, ?, ?);
    `).run(name.trim(), imageUrl, version, width || 1600, height || 1000);

    const newMapId = Number(result.lastInsertRowid);
    recordAudit(req, 'CREATE', 'MAP', newMapId, `Uploaded new map version ${version}: "${name}"`);

    const createdMap = db.prepare('SELECT * FROM maps WHERE id = ?;').get(newMapId);

    realtimeHub.broadcast('MAP_CHANGED', {
      id: createdMap.id,
      name: createdMap.name,
      imageUrl: createdMap.image_url,
      version: createdMap.version
    }, createdMap);

    sendJson(res, 201, { success: true, map: createdMap });
  } catch (err) {
    console.error('[Create Map Error]', err);
    sendJson(res, 500, { success: false, error: 'Failed to create map.' });
  }
}

function handleActivateMap(req, res, mapId) {
  try {
    db.prepare('UPDATE maps SET is_active = 0;').run();
    db.prepare('UPDATE maps SET is_active = 1 WHERE id = ?;').run(mapId);

    const map = db.prepare('SELECT * FROM maps WHERE id = ?;').get(mapId);
    recordAudit(req, 'UPDATE', 'MAP', mapId, `Activated map "${map ? map.name : mapId}"`);

    if (map) {
      realtimeHub.broadcast('MAP_CHANGED', {
        id: map.id,
        name: map.name,
        imageUrl: map.image_url,
        version: map.version
      }, map);
    }

    sendJson(res, 200, { success: true, message: 'Map activated successfully.', map });
  } catch (err) {
    console.error('[Activate Map Error]', err);
    sendJson(res, 500, { success: false, error: 'Failed to activate map.' });
  }
}

// ----------------- ZONES MANAGEMENT -----------------
function handleGetZones(req, res) {
  try {
    const zones = db.prepare(`
      SELECT 
        z.*, 
        COUNT(s.id) AS total_stalls,
        COUNT(CASE WHEN s.booking_status = 'Booked' THEN 1 END) AS booked_stalls,
        COUNT(CASE WHEN s.booking_status = 'Available' THEN 1 END) AS available_stalls,
        COUNT(CASE WHEN s.public_visible = 1 THEN 1 END) AS public_stalls
      FROM zones z
      LEFT JOIN stalls s ON z.id = s.zone_id
      GROUP BY z.id
      ORDER BY z.name ASC;
    `).all();
    sendJson(res, 200, { success: true, zones });
  } catch (err) {
    console.error('[Get Zones Error]', err);
    sendJson(res, 500, { success: false, error: 'Failed to retrieve zones.' });
  }
}

function handleCreateZone(req, res, body) {
  try {
    const { name, shape, x, y, width, height, rotation, color, is_public, description } = body;
    if (!name || !name.trim()) {
      return sendJson(res, 400, { success: false, error: 'Zone name is required.' });
    }

    const activeMap = db.prepare('SELECT id FROM maps WHERE is_active = 1 LIMIT 1;').get();
    if (!activeMap) {
      return sendJson(res, 400, { success: false, error: 'No active map found. Please upload a map first.' });
    }

    const result = db.prepare(`
      INSERT INTO zones (map_id, name, shape, x, y, width, height, rotation, color, is_public, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run(
      activeMap.id,
      name.trim(),
      shape || 'rect',
      Math.max(0, Math.min(100, Number(x) || 10)),
      Math.max(0, Math.min(100, Number(y) || 10)),
      Math.max(1, Math.min(100, Number(width) || 15)),
      Math.max(1, Math.min(100, Number(height) || 15)),
      Number(rotation) || 0,
      color || '#3b82f6',
      is_public !== undefined ? (is_public ? 1 : 0) : 1,
      description || ''
    );

    const zoneId = Number(result.lastInsertRowid);
    recordAudit(req, 'CREATE', 'ZONE', zoneId, `Created zone/pin "${name}"`);
    broadcastZoneChange('CREATE', zoneId);

    const newZone = db.prepare('SELECT * FROM zones WHERE id = ?;').get(zoneId);
    sendJson(res, 201, { success: true, zone: newZone });
  } catch (err) {
    console.error('[Create Zone Error]', err);
    sendJson(res, 500, { success: false, error: 'Failed to create zone.' });
  }
}

function handleUpdateZone(req, res, zoneId, body) {
  try {
    const existing = db.prepare('SELECT * FROM zones WHERE id = ?;').get(zoneId);
    if (!existing) {
      return sendJson(res, 404, { success: false, error: 'Zone not found.' });
    }

    const name = body.name !== undefined ? body.name.trim() : existing.name;
    const shape = body.shape !== undefined ? body.shape : existing.shape;
    const x = body.x !== undefined ? Math.max(0, Math.min(100, Number(body.x))) : existing.x;
    const y = body.y !== undefined ? Math.max(0, Math.min(100, Number(body.y))) : existing.y;
    const width = body.width !== undefined ? Math.max(1, Math.min(100, Number(body.width))) : existing.width;
    const height = body.height !== undefined ? Math.max(1, Math.min(100, Number(body.height))) : existing.height;
    const rotation = body.rotation !== undefined ? Number(body.rotation) : existing.rotation;
    const color = body.color !== undefined ? body.color : existing.color;
    const is_public = body.is_public !== undefined ? (body.is_public ? 1 : 0) : existing.is_public;
    const description = body.description !== undefined ? body.description : existing.description;

    db.prepare(`
      UPDATE zones SET 
        name = ?, shape = ?, x = ?, y = ?, width = ?, height = ?, 
        rotation = ?, color = ?, is_public = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?;
    `).run(name, shape, x, y, width, height, rotation, color, is_public, description, zoneId);

    recordAudit(req, 'UPDATE', 'ZONE', zoneId, `Updated zone "${name}"`);
    broadcastZoneChange('UPDATE', zoneId);

    const updatedZone = db.prepare('SELECT * FROM zones WHERE id = ?;').get(zoneId);
    sendJson(res, 200, { success: true, zone: updatedZone });
  } catch (err) {
    console.error('[Update Zone Error]', err);
    sendJson(res, 500, { success: false, error: 'Failed to update zone.' });
  }
}

function handleDeleteZone(req, res, zoneId) {
  try {
    const existing = db.prepare('SELECT * FROM zones WHERE id = ?;').get(zoneId);
    if (!existing) {
      return sendJson(res, 404, { success: false, error: 'Zone not found.' });
    }

    db.prepare('DELETE FROM zones WHERE id = ?;').run(zoneId);
    recordAudit(req, 'DELETE', 'ZONE', zoneId, `Deleted zone "${existing.name}"`);
    broadcastZoneChange('DELETE', zoneId);

    sendJson(res, 200, { success: true, message: `Zone "${existing.name}" deleted.` });
  } catch (err) {
    console.error('[Delete Zone Error]', err);
    sendJson(res, 500, { success: false, error: 'Failed to delete zone.' });
  }
}

function handleDuplicateZone(req, res, zoneId) {
  try {
    const zone = db.prepare('SELECT * FROM zones WHERE id = ?;').get(zoneId);
    if (!zone) {
      return sendJson(res, 404, { success: false, error: 'Zone not found.' });
    }

    const newName = `${zone.name} (Copy)`;
    const newX = Math.min(85, zone.x + 3);
    const newY = Math.min(85, zone.y + 3);

    const result = db.prepare(`
      INSERT INTO zones (map_id, name, shape, x, y, width, height, rotation, color, is_public, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run(zone.map_id, newName, zone.shape, newX, newY, zone.width, zone.height, zone.rotation, zone.color, zone.is_public, zone.description);

    const newZoneId = Number(result.lastInsertRowid);
    recordAudit(req, 'CREATE', 'ZONE', newZoneId, `Duplicated zone from "${zone.name}" to "${newName}"`);
    broadcastZoneChange('CREATE', newZoneId);

    const newZone = db.prepare('SELECT * FROM zones WHERE id = ?;').get(newZoneId);
    sendJson(res, 201, { success: true, zone: newZone });
  } catch (err) {
    console.error('[Duplicate Zone Error]', err);
    sendJson(res, 500, { success: false, error: 'Failed to duplicate zone.' });
  }
}

// ----------------- STALLS MANAGEMENT -----------------
function handleGetStalls(req, res, queryParams) {
  try {
    let sql = `
      SELECT s.*, z.name AS zone_name, z.color AS zone_color
      FROM stalls s
      LEFT JOIN zones z ON s.zone_id = z.id
      WHERE 1=1
    `;
    const params = [];

    if (queryParams.zone_id) {
      sql += ` AND s.zone_id = ?`;
      params.push(queryParams.zone_id);
    }
    if (queryParams.booking_status) {
      sql += ` AND s.booking_status = ?`;
      params.push(queryParams.booking_status);
    }
    if (queryParams.payment_status) {
      sql += ` AND s.payment_status = ?`;
      params.push(queryParams.payment_status);
    }
    if (queryParams.public_visible !== undefined && queryParams.public_visible !== '') {
      sql += ` AND s.public_visible = ?`;
      params.push(Number(queryParams.public_visible));
    }
    if (queryParams.category) {
      sql += ` AND s.category = ?`;
      params.push(queryParams.category);
    }
    if (queryParams.search) {
      const sTerm = `%${queryParams.search.toLowerCase()}%`;
      sql += ` AND (
        LOWER(s.stall_number) LIKE ? OR
        LOWER(s.company_name) LIKE ? OR
        LOWER(s.contact_person) LIKE ? OR
        LOWER(s.phone) LIKE ? OR
        LOWER(s.email) LIKE ? OR
        LOWER(s.category) LIKE ?
      )`;
      params.push(sTerm, sTerm, sTerm, sTerm, sTerm, sTerm);
    }

    sql += ` ORDER BY s.stall_number ASC;`;
    const stalls = db.prepare(sql).all(...params);

    sendJson(res, 200, {
      success: true,
      total: stalls.length,
      stalls
    });
  } catch (err) {
    console.error('[Admin Stalls Error]', err);
    sendJson(res, 500, { success: false, error: 'Failed to retrieve stalls.' });
  }
}

function handleCreateStall(req, res, body) {
  try {
    const {
      zone_id, stall_number, company_name, company_logo, category,
      public_description, public_logo, show_company_name, show_logo, show_category, show_description,
      public_visible, contact_person, phone, email, payment_status, payment_amount, booking_status, internal_notes,
      x, y, width, height, shape, color
    } = body;

    if (!zone_id || !stall_number || !stall_number.trim()) {
      return sendJson(res, 400, { success: false, error: 'Zone and Stall Number are required.' });
    }

    const zoneExists = db.prepare('SELECT id FROM zones WHERE id = ?;').get(Number(zone_id));
    if (!zoneExists) {
      return sendJson(res, 400, { success: false, error: 'Selected Zone does not exist.' });
    }

    // Check duplicate stall number
    const duplicate = db.prepare('SELECT id FROM stalls WHERE stall_number = ? LIMIT 1;').get(stall_number.trim());
    if (duplicate) {
      return sendJson(res, 400, { success: false, error: `Stall number "${stall_number}" already exists.` });
    }

    const result = db.prepare(`
      INSERT INTO stalls (
        zone_id, stall_number, company_name, company_logo, category,
        public_description, public_logo, show_company_name, show_logo, show_category, show_description,
        public_visible, contact_person, phone, email, payment_status, payment_amount, booking_status, internal_notes,
        x, y, width, height, shape, color
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run(
      Number(zone_id),
      stall_number.trim(),
      company_name || '',
      company_logo || '',
      category || 'General',
      public_description || '',
      public_logo || '',
      show_company_name !== undefined ? (show_company_name ? 1 : 0) : 1,
      show_logo !== undefined ? (show_logo ? 1 : 0) : 1,
      show_category !== undefined ? (show_category ? 1 : 0) : 1,
      show_description !== undefined ? (show_description ? 1 : 0) : 1,
      public_visible !== undefined ? (public_visible ? 1 : 0) : 1,
      contact_person || '',
      phone || '',
      email || '',
      payment_status || 'Unpaid',
      Number(payment_amount) || 0.0,
      booking_status || 'Available',
      internal_notes || '',
      x !== undefined ? Number(x) : 20.0,
      y !== undefined ? Number(y) : 20.0,
      width !== undefined ? Number(width) : 7.0,
      height !== undefined ? Number(height) : 7.0,
      shape || 'rect',
      color || '#3b82f6'
    );

    const stallId = Number(result.lastInsertRowid);
    recordAudit(req, 'CREATE', 'STALL', stallId, `Created stall "${stall_number}" (Company: ${company_name || 'N/A'})`);
    broadcastStallChange('CREATE', stallId, Number(zone_id));

    const newStall = db.prepare('SELECT * FROM stalls WHERE id = ?;').get(stallId);
    sendJson(res, 201, { success: true, stall: newStall });
  } catch (err) {
    console.error('[Create Stall Error]', err);
    sendJson(res, 500, { success: false, error: 'Failed to create stall: ' + err.message });
  }
}

function handleUpdateStall(req, res, stallId, body) {
  try {
    const existing = db.prepare('SELECT * FROM stalls WHERE id = ?;').get(stallId);
    if (!existing) {
      return sendJson(res, 404, { success: false, error: 'Stall not found.' });
    }

    // Check duplicate stall number if changed
    if (body.stall_number && body.stall_number.trim() !== existing.stall_number) {
      const duplicate = db.prepare('SELECT id FROM stalls WHERE stall_number = ? AND id != ? LIMIT 1;').get(body.stall_number.trim(), stallId);
      if (duplicate) {
        return sendJson(res, 400, { success: false, error: `Stall number "${body.stall_number}" is already used.` });
      }
    }

    const zone_id = body.zone_id !== undefined ? Number(body.zone_id) : existing.zone_id;
    const stall_number = body.stall_number !== undefined ? body.stall_number.trim() : existing.stall_number;
    const company_name = body.company_name !== undefined ? body.company_name : existing.company_name;
    const company_logo = body.company_logo !== undefined ? body.company_logo : existing.company_logo;
    const category = body.category !== undefined ? body.category : existing.category;
    const public_description = body.public_description !== undefined ? body.public_description : existing.public_description;
    const public_logo = body.public_logo !== undefined ? body.public_logo : existing.public_logo;
    const show_company_name = body.show_company_name !== undefined ? (body.show_company_name ? 1 : 0) : existing.show_company_name;
    const show_logo = body.show_logo !== undefined ? (body.show_logo ? 1 : 0) : existing.show_logo;
    const show_category = body.show_category !== undefined ? (body.show_category ? 1 : 0) : existing.show_category;
    const show_description = body.show_description !== undefined ? (body.show_description ? 1 : 0) : existing.show_description;
    const public_visible = body.public_visible !== undefined ? (body.public_visible ? 1 : 0) : existing.public_visible;
    const contact_person = body.contact_person !== undefined ? body.contact_person : existing.contact_person;
    const phone = body.phone !== undefined ? body.phone : existing.phone;
    const email = body.email !== undefined ? body.email : existing.email;
    const payment_status = body.payment_status !== undefined ? body.payment_status : existing.payment_status;
    const payment_amount = body.payment_amount !== undefined ? Number(body.payment_amount) : existing.payment_amount;
    const booking_status = body.booking_status !== undefined ? body.booking_status : existing.booking_status;
    const internal_notes = body.internal_notes !== undefined ? body.internal_notes : existing.internal_notes;
    const x = body.x !== undefined ? Number(body.x) : existing.x;
    const y = body.y !== undefined ? Number(body.y) : existing.y;
    const width = body.width !== undefined ? Number(body.width) : existing.width;
    const height = body.height !== undefined ? Number(body.height) : existing.height;
    const shape = body.shape !== undefined ? body.shape : existing.shape;
    const color = body.color !== undefined ? body.color : existing.color;

    db.prepare(`
      UPDATE stalls SET
        zone_id = ?, stall_number = ?, company_name = ?, company_logo = ?, category = ?,
        public_description = ?, public_logo = ?, show_company_name = ?, show_logo = ?, show_category = ?, show_description = ?,
        public_visible = ?, contact_person = ?, phone = ?, email = ?, payment_status = ?, payment_amount = ?, booking_status = ?, internal_notes = ?,
        x = ?, y = ?, width = ?, height = ?, shape = ?, color = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?;
    `).run(
      zone_id, stall_number, company_name, company_logo, category,
      public_description, public_logo, show_company_name, show_logo, show_category, show_description,
      public_visible, contact_person, phone, email, payment_status, payment_amount, booking_status, internal_notes,
      x, y, width, height, shape, color,
      stallId
    );

    recordAudit(req, 'UPDATE', 'STALL', stallId, `Updated stall "${stall_number}" (Status: ${booking_status}, Paid: ${payment_status})`);
    broadcastStallChange('UPDATE', stallId, zone_id);

    const updatedStall = db.prepare('SELECT * FROM stalls WHERE id = ?;').get(stallId);
    sendJson(res, 200, { success: true, stall: updatedStall });
  } catch (err) {
    console.error('[Update Stall Error]', err);
    sendJson(res, 500, { success: false, error: 'Failed to update stall: ' + err.message });
  }
}

function handleDeleteStall(req, res, stallId) {
  try {
    const existing = db.prepare('SELECT * FROM stalls WHERE id = ?;').get(stallId);
    if (!existing) {
      return sendJson(res, 404, { success: false, error: 'Stall not found.' });
    }

    db.prepare('DELETE FROM stalls WHERE id = ?;').run(stallId);
    recordAudit(req, 'DELETE', 'STALL', stallId, `Deleted stall "${existing.stall_number}"`);
    broadcastStallChange('DELETE', stallId, existing.zone_id);

    sendJson(res, 200, { success: true, message: `Stall "${existing.stall_number}" deleted.` });
  } catch (err) {
    console.error('[Delete Stall Error]', err);
    sendJson(res, 500, { success: false, error: 'Failed to delete stall.' });
  }
}

function handleDuplicateStall(req, res, stallId) {
  try {
    const stall = db.prepare('SELECT * FROM stalls WHERE id = ?;').get(stallId);
    if (!stall) {
      return sendJson(res, 404, { success: false, error: 'Stall not found.' });
    }

    const newNumber = `${stall.stall_number}-COPY`;
    const newX = Math.min(90, (stall.x || 20) + 3);
    const newY = Math.min(90, (stall.y || 20) + 3);

    const result = db.prepare(`
      INSERT INTO stalls (
        zone_id, stall_number, company_name, company_logo, category,
        public_description, public_logo, show_company_name, show_logo, show_category, show_description,
        public_visible, contact_person, phone, email, payment_status, payment_amount, booking_status, internal_notes,
        x, y, width, height, shape, color
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run(
      stall.zone_id, newNumber, stall.company_name, stall.company_logo, stall.category,
      stall.public_description, stall.public_logo, stall.show_company_name, stall.show_logo, stall.show_category, stall.show_description,
      stall.public_visible, stall.contact_person, stall.phone, stall.email, stall.payment_status, stall.payment_amount, stall.booking_status, stall.internal_notes,
      newX, newY, stall.width, stall.height, stall.shape, stall.color
    );

    const newId = Number(result.lastInsertRowid);
    recordAudit(req, 'CREATE', 'STALL', newId, `Duplicated stall from "${stall.stall_number}" to "${newNumber}"`);
    broadcastStallChange('CREATE', newId, stall.zone_id);

    const newStall = db.prepare('SELECT * FROM stalls WHERE id = ?;').get(newId);
    sendJson(res, 201, { success: true, stall: newStall });
  } catch (err) {
    console.error('[Duplicate Stall Error]', err);
    sendJson(res, 500, { success: false, error: 'Failed to duplicate stall.' });
  }
}

// ----------------- CSV BATCH IMPORT & EXPORT -----------------
function handleImportStallsCSV(req, res, body) {
  try {
    const { csvData, defaultZoneId } = body;
    if (!csvData || typeof csvData !== 'string') {
      return sendJson(res, 400, { success: false, error: 'CSV text data is required.' });
    }

    const lines = csvData.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length <= 1) {
      return sendJson(res, 400, { success: false, error: 'CSV file is empty or missing headers.' });
    }

    const headerLine = lines[0].toLowerCase();
    const headers = headerLine.split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));

    const results = {
      total: lines.length - 1,
      imported: 0,
      errors: []
    };

    const zones = db.prepare('SELECT id, name FROM zones;').all();
    const zoneMap = {};
    zones.forEach(z => {
      zoneMap[z.id] = z.id;
      zoneMap[z.name.toLowerCase()] = z.id;
    });

    const insertStmt = db.prepare(`
      INSERT INTO stalls (
        zone_id, stall_number, company_name, category, contact_person, phone, email,
        payment_status, payment_amount, booking_status, public_description, public_visible,
        x, y, width, height, shape, color
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    for (let i = 1; i < lines.length; i++) {
      const rawLine = lines[i];
      const values = [];
      let inQuotes = false;
      let currentVal = '';
      for (let c = 0; c < rawLine.length; c++) {
        const char = rawLine[c];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(currentVal.trim());
          currentVal = '';
        } else {
          currentVal += char;
        }
      }
      values.push(currentVal.trim());

      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] ? values[idx].replace(/^["']|["']$/g, '') : '';
      });

      const stallNum = row['stallnumber'] || row['stall_number'] || row['stall'] || row['number'] || values[0];
      if (!stallNum) {
        results.errors.push({ line: i + 1, error: 'Missing stall number' });
        continue;
      }

      const exists = db.prepare('SELECT id FROM stalls WHERE stall_number = ?;').get(stallNum);
      if (exists) {
        results.errors.push({ line: i + 1, error: `Stall number "${stallNum}" already exists` });
        continue;
      }

      let targetZoneId = defaultZoneId;
      const zoneVal = row['zone'] || row['zone_id'] || row['zonename'];
      if (zoneVal && zoneMap[zoneVal.toLowerCase()]) {
        targetZoneId = zoneMap[zoneVal.toLowerCase()];
      }

      if (!targetZoneId && zones.length > 0) {
        targetZoneId = zones[0].id;
      }

      if (!targetZoneId) {
        results.errors.push({ line: i + 1, error: `No valid zone found for stall "${stallNum}"` });
        continue;
      }

      try {
        insertStmt.run(
          Number(targetZoneId),
          stallNum,
          row['company'] || row['companyname'] || row['company_name'] || '',
          row['category'] || 'General',
          row['contact'] || row['contactperson'] || row['contact_person'] || '',
          row['phone'] || '',
          row['email'] || '',
          row['paymentstatus'] || row['payment_status'] || 'Unpaid',
          parseFloat(row['amount'] || row['paymentamount'] || 0) || 0,
          row['bookingstatus'] || row['booking_status'] || 'Available',
          row['description'] || row['publicdescription'] || '',
          1,
          parseFloat(row['x'] || 20) || 20,
          parseFloat(row['y'] || 20) || 20,
          parseFloat(row['width'] || 7) || 7,
          parseFloat(row['height'] || 7) || 7,
          row['shape'] || 'rect',
          row['color'] || '#3b82f6'
        );
        results.imported++;
      } catch (e) {
        results.errors.push({ line: i + 1, error: e.message });
      }
    }

    recordAudit(req, 'IMPORT', 'STALL', 'BATCH', `CSV imported ${results.imported} stalls with ${results.errors.length} errors`);
    sendJson(res, 200, { success: true, results });
  } catch (err) {
    console.error('[CSV Import Error]', err);
    sendJson(res, 500, { success: false, error: 'CSV Import failed: ' + err.message });
  }
}

function handleExportStallsCSV(req, res) {
  try {
    const stalls = db.prepare(`
      SELECT s.*, z.name AS zone_name
      FROM stalls s
      LEFT JOIN zones z ON s.zone_id = z.id
      ORDER BY s.stall_number ASC;
    `).all();

    const headers = [
      'stall_number', 'zone_name', 'company_name', 'category', 'booking_status',
      'payment_status', 'payment_amount', 'contact_person', 'phone', 'email',
      'public_visible', 'public_description', 'x', 'y', 'width', 'height', 'shape', 'internal_notes'
    ];

    let csv = headers.join(',') + '\r\n';
    stalls.forEach(s => {
      const row = [
        `"${(s.stall_number || '').replace(/"/g, '""')}"`,
        `"${(s.zone_name || '').replace(/"/g, '""')}"`,
        `"${(s.company_name || '').replace(/"/g, '""')}"`,
        `"${(s.category || '').replace(/"/g, '""')}"`,
        `"${(s.booking_status || '').replace(/"/g, '""')}"`,
        `"${(s.payment_status || '').replace(/"/g, '""')}"`,
        s.payment_amount || 0,
        `"${(s.contact_person || '').replace(/"/g, '""')}"`,
        `"${(s.phone || '').replace(/"/g, '""')}"`,
        `"${(s.email || '').replace(/"/g, '""')}"`,
        s.public_visible ? '1' : '0',
        `"${(s.public_description || '').replace(/"/g, '""')}"`,
        s.x || 0,
        s.y || 0,
        s.width || 7,
        s.height || 7,
        `"${(s.shape || 'rect')}"`,
        `"${(s.internal_notes || '').replace(/"/g, '""')}"`
      ];
      csv += row.join(',') + '\r\n';
    });

    res.writeHead(200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="stalls_export.csv"'
    });
    res.end(csv);
  } catch (err) {
    console.error('[CSV Export Error]', err);
    sendJson(res, 500, { success: false, error: 'CSV Export failed.' });
  }
}

// ----------------- AUDIT LOGS -----------------
function handleGetAuditLogs(req, res) {
  try {
    const logs = db.prepare(`
      SELECT * FROM audit_logs
      ORDER BY id DESC
      LIMIT 100;
    `).all();
    sendJson(res, 200, { success: true, logs });
  } catch (err) {
    console.error('[Audit Logs Error]', err);
    sendJson(res, 500, { success: false, error: 'Failed to retrieve audit logs.' });
  }
}

module.exports = {
  handleLogin,
  handleLogout,
  handleGetMe,
  handleChangePassword,
  handleGetStats,
  handleGetMaps,
  handleCreateMap,
  handleActivateMap,
  handleGetZones,
  handleCreateZone,
  handleUpdateZone,
  handleDeleteZone,
  handleDuplicateZone,
  handleGetStalls,
  handleCreateStall,
  handleUpdateStall,
  handleDeleteStall,
  handleDuplicateStall,
  handleImportStallsCSV,
  handleExportStallsCSV,
  handleGetAuditLogs
};
