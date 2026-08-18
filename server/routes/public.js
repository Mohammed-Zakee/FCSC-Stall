// server/routes/public.js
const { db } = require('../db.js');

// Utility to write JSON response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=5', // Short caching for high traffic
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

// 1. GET /api/public/map - Get active map info
function handleGetPublicMap(req, res) {
  try {
    const map = db.prepare(`
      SELECT id, name, image_url, version, width, height, updated_at
      FROM maps
      WHERE is_active = 1
      LIMIT 1;
    `).get();

    if (!map) {
      return sendJson(res, 404, {
        success: false,
        error: 'No active event map found.'
      });
    }

    sendJson(res, 200, {
      success: true,
      data: {
        id: map.id,
        name: map.name,
        imageUrl: map.image_url,
        version: map.version,
        width: map.width,
        height: map.height,
        updatedAt: map.updated_at
      }
    });
  } catch (err) {
    console.error('[Public API] Error in handleGetPublicMap:', err);
    sendJson(res, 500, { success: false, error: 'Failed to retrieve event map.' });
  }
}

// 2. GET /api/public/zones - Get all public zones with public stall counts
function handleGetPublicZones(req, res) {
  try {
    // Select active map
    const activeMap = db.prepare('SELECT id FROM maps WHERE is_active = 1 LIMIT 1;').get();
    if (!activeMap) {
      return sendJson(res, 200, { success: true, data: [] });
    }

    // STRICT PROJECTION: Select ONLY public columns for public zones
    const zones = db.prepare(`
      SELECT 
        z.id, 
        z.name, 
        z.shape, 
        z.x, 
        z.y, 
        z.width, 
        z.height, 
        z.rotation, 
        z.color, 
        z.description,
        COUNT(CASE WHEN s.public_visible = 1 THEN 1 END) AS public_stall_count
      FROM zones z
      LEFT JOIN stalls s ON z.id = s.zone_id
      WHERE z.map_id = ? AND z.is_public = 1
      GROUP BY z.id
      ORDER BY z.name ASC;
    `).all(activeMap.id);

    const formattedZones = zones.map(z => ({
      id: z.id,
      name: z.name,
      shape: z.shape,
      x: z.x,
      y: z.y,
      width: z.width,
      height: z.height,
      rotation: z.rotation,
      color: z.color,
      description: z.description || '',
      stallCount: Number(z.public_stall_count || 0)
    }));

    sendJson(res, 200, {
      success: true,
      data: formattedZones
    });
  } catch (err) {
    console.error('[Public API] Error in handleGetPublicZones:', err);
    sendJson(res, 500, { success: false, error: 'Failed to retrieve interactive zones.' });
  }
}

// 3. GET /api/public/zones/:id/stalls - Get public stalls for a specific zone
function handleGetPublicZoneStalls(req, res, zoneId) {
  try {
    // Verify zone is public
    const zone = db.prepare(`
      SELECT id, name, is_public, description
      FROM zones
      WHERE id = ? AND is_public = 1
      LIMIT 1;
    `).get(zoneId);

    if (!zone) {
      return sendJson(res, 404, {
        success: false,
        error: 'Zone not found or not currently public.'
      });
    }

    // STRICT PROJECTION: Select strictly public columns WHERE public_visible = 1
    // NEVER select contact_person, phone, email, payment_status, payment_amount, booking_status, internal_notes
    const stalls = db.prepare(`
      SELECT 
        stall_number,
        company_name,
        category,
        public_description,
        public_logo,
        show_company_name,
        show_logo,
        show_category,
        show_description
      FROM stalls
      WHERE zone_id = ? AND public_visible = 1
      ORDER BY stall_number ASC;
    `).all(zoneId);

    // Sanitize values according to admin-defined public toggle flags
    const sanitizedStalls = stalls.map(s => {
      const stall = {
        stallNumber: s.stall_number
      };

      if (s.show_company_name && s.company_name) {
        stall.companyName = s.company_name;
      }
      if (s.show_category && s.category) {
        stall.category = s.category;
      }
      if (s.show_description && s.public_description) {
        stall.description = s.public_description;
      }
      if (s.show_logo && (s.public_logo || '')) {
        stall.logo = s.public_logo;
      }

      return stall;
    });

    sendJson(res, 200, {
      success: true,
      zone: {
        id: zone.id,
        name: zone.name,
        description: zone.description || ''
      },
      stalls: sanitizedStalls
    });
  } catch (err) {
    console.error('[Public API] Error in handleGetPublicZoneStalls:', err);
    sendJson(res, 500, { success: false, error: 'Failed to retrieve stall details.' });
  }
}

// 4. GET /api/public/search?q=... - Search public stalls & zones
function handlePublicSearch(req, res, query) {
  try {
    if (!query || query.trim().length === 0) {
      return sendJson(res, 200, { success: true, results: [] });
    }

    const searchTerm = `%${query.trim().toLowerCase()}%`;

    const results = db.prepare(`
      SELECT 
        s.stall_number,
        s.company_name,
        s.category,
        s.public_description,
        s.show_company_name,
        s.show_category,
        s.show_description,
        z.id AS zone_id,
        z.name AS zone_name,
        z.x AS zone_x,
        z.y AS zone_y
      FROM stalls s
      JOIN zones z ON s.zone_id = z.id
      JOIN maps m ON z.map_id = m.id
      WHERE m.is_active = 1
        AND z.is_public = 1
        AND s.public_visible = 1
        AND (
          LOWER(s.stall_number) LIKE ?
          OR (s.show_company_name = 1 AND LOWER(s.company_name) LIKE ?)
          OR (s.show_category = 1 AND LOWER(s.category) LIKE ?)
          OR (s.show_description = 1 AND LOWER(s.public_description) LIKE ?)
          OR LOWER(z.name) LIKE ?
        )
      LIMIT 20;
    `).all(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);

    const sanitizedResults = results.map(r => {
      const item = {
        stallNumber: r.stall_number,
        zoneId: r.zone_id,
        zoneName: r.zone_name,
        zoneCoords: { x: r.zone_x, y: r.zone_y }
      };
      if (r.show_company_name && r.company_name) item.companyName = r.company_name;
      if (r.show_category && r.category) item.category = r.category;
      if (r.show_description && r.public_description) item.description = r.public_description;
      return item;
    });

    sendJson(res, 200, {
      success: true,
      results: sanitizedResults
    });
  } catch (err) {
    console.error('[Public API] Error in handlePublicSearch:', err);
    sendJson(res, 500, { success: false, error: 'Search query failed.' });
  }
}

module.exports = {
  handleGetPublicMap,
  handleGetPublicZones,
  handleGetPublicZoneStalls,
  handlePublicSearch
};
