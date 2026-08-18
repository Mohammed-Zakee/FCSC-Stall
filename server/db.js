// server/db.js
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

// Ensure data and upload directories exist
const dataDir = path.join(__dirname, '..', 'data');
const uploadsDir = path.join(__dirname, '..', 'uploads');
const mapsDir = path.join(uploadsDir, 'maps');
const logosDir = path.join(uploadsDir, 'logos');

[dataDir, uploadsDir, mapsDir, logosDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const dbPath = path.join(dataDir, 'stall_plan.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode & foreign keys for high performance and integrity
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Initialize database schema
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS maps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      image_url TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      width INTEGER DEFAULT 1600,
      height INTEGER DEFAULT 1000,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS zones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      map_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      shape TEXT NOT NULL DEFAULT 'rect', -- rect, rounded_rect, circle
      x REAL NOT NULL, -- percentage 0-100
      y REAL NOT NULL, -- percentage 0-100
      width REAL NOT NULL, -- percentage 0-100
      height REAL NOT NULL, -- percentage 0-100
      rotation REAL NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#3b82f6',
      is_public INTEGER NOT NULL DEFAULT 1,
      description TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS stalls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      zone_id INTEGER NOT NULL,
      stall_number TEXT NOT NULL,
      company_name TEXT DEFAULT '',
      company_logo TEXT DEFAULT '',
      category TEXT DEFAULT 'General',
      public_description TEXT DEFAULT '',
      public_logo TEXT DEFAULT '',
      show_company_name INTEGER DEFAULT 1,
      show_logo INTEGER DEFAULT 1,
      show_category INTEGER DEFAULT 1,
      show_description INTEGER DEFAULT 1,
      public_visible INTEGER DEFAULT 1,
      contact_person TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      payment_status TEXT DEFAULT 'Unpaid', -- Paid, Pending, Unpaid, Partial, Refunded
      payment_amount REAL DEFAULT 0.0,
      booking_status TEXT DEFAULT 'Available', -- Available, Booked, Reserved, Blocked
      internal_notes TEXT DEFAULT '',
      x REAL, -- percentage on map
      y REAL, -- percentage on map
      width REAL DEFAULT 6.5, -- percentage width
      height REAL DEFAULT 6.5, -- percentage height
      shape TEXT DEFAULT 'rect', -- rect, rounded_rect, circle
      color TEXT DEFAULT '#3b82f6',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_name TEXT DEFAULT 'System',
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrate columns if missing
  try {
    const tableInfo = db.prepare('PRAGMA table_info(stalls);').all();
    const colNames = tableInfo.map(c => c.name);
    if (!colNames.includes('x')) db.exec('ALTER TABLE stalls ADD COLUMN x REAL;');
    if (!colNames.includes('y')) db.exec('ALTER TABLE stalls ADD COLUMN y REAL;');
    if (!colNames.includes('width')) db.exec('ALTER TABLE stalls ADD COLUMN width REAL DEFAULT 6.5;');
    if (!colNames.includes('height')) db.exec('ALTER TABLE stalls ADD COLUMN height REAL DEFAULT 6.5;');
    if (!colNames.includes('shape')) db.exec('ALTER TABLE stalls ADD COLUMN shape TEXT DEFAULT "rect";');
    if (!colNames.includes('color')) db.exec('ALTER TABLE stalls ADD COLUMN color TEXT DEFAULT "#3b82f6";');
  } catch (e) {
    // Migration already applied or ignore
  }
}

// Password hashing utility using native node:crypto scrypt
function hashPassword(password, salt = null) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, storedHash, salt) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  const bufferA = Buffer.from(hash, 'hex');
  const bufferB = Buffer.from(storedHash, 'hex');
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

// Seed default initial data if database is fresh
function seedInitialData() {
  initSchema();

  // 1. Seed Admin User
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users;').get().count;
  if (userCount === 0) {
    const { hash, salt } = hashPassword('Admin@123456');
    db.prepare(`
      INSERT INTO users (name, email, password_hash, salt, role)
      VALUES (?, ?, ?, ?, 'admin');
    `).run('Super Administrator', 'admin@event.com', hash, salt);
    console.log('[DB] Seeded default administrator: admin@event.com');
  }

  // 2. Seed Default Floor Plan Map
  const mapCount = db.prepare('SELECT COUNT(*) as count FROM maps;').get().count;
  let activeMapId = 1;
  if (mapCount === 0) {
    const defaultMapSvg = `/assets/default-floorplan.svg`;
    const result = db.prepare(`
      INSERT INTO maps (name, image_url, version, is_active, width, height)
      VALUES (?, ?, 1, 1, 1600, 1000);
    `).run('Main Exhibition Hall - Level 1', defaultMapSvg);
    activeMapId = Number(result.lastInsertRowid);
    console.log('[DB] Seeded default map layout');
  } else {
    const activeMap = db.prepare('SELECT id FROM maps WHERE is_active = 1 LIMIT 1;').get();
    if (activeMap) activeMapId = activeMap.id;
  }

  // 3. Seed Default Zones if empty
  const zoneCount = db.prepare('SELECT COUNT(*) as count FROM zones;').get().count;
  if (zoneCount === 0) {
    const insertZone = db.prepare(`
      INSERT INTO zones (map_id, name, shape, x, y, width, height, rotation, color, is_public, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    // Tech Pavilion
    const z1 = insertZone.run(activeMapId, 'Zone A - Tech Pavilion', 'rect', 12.5, 18.0, 24.0, 32.0, 0, '#3b82f6', 1, 'Premier Innovation & Technology Stalls');
    const zone1Id = Number(z1.lastInsertRowid);

    // Food & Dining Court
    const z2 = insertZone.run(activeMapId, 'Zone B - Gourmet Food & Beverages', 'rect', 63.5, 18.0, 24.0, 32.0, 0, '#f59e0b', 1, 'Artisanal dining, snacks, organic coffees & refreshments');
    const zone2Id = Number(z2.lastInsertRowid);

    // Main Stage Sponsors
    const z3 = insertZone.run(activeMapId, 'Zone C - Main Stage Sponsors', 'rounded_rect', 32.0, 60.0, 36.0, 26.0, 0, '#10b981', 1, 'Exclusive Headliner Partners & VIP Lounge');
    const zone3Id = Number(z3.lastInsertRowid);

    // Seed Sample Stalls with visual coordinates mapped to SVG floorplan!
    const insertStall = db.prepare(`
      INSERT INTO stalls (
        zone_id, stall_number, company_name, company_logo, category,
        public_description, public_logo, show_company_name, show_logo, show_category, show_description,
        public_visible, contact_person, phone, email, payment_status, payment_amount, booking_status, internal_notes,
        x, y, width, height, shape, color
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    // Zone A Stalls (Aligned with SVG booths in Zone A)
    insertStall.run(zone1Id, 'A-01', 'Quantum Robotics Corp', '', 'Robotics & AI', 'Next-gen autonomous robotic systems and AI software.', '', 1, 1, 1, 1, 1, 'Marcus Vance', '+1 555-0192', 'marcus@quantumrobotics.io', 'Paid', 4500.00, 'Booked', 'Requires 3-phase power supply and dedicated fiber line.', 14.0, 24.0, 9.4, 10.0, 'rect', '#2563eb');
    insertStall.run(zone1Id, 'A-02', 'CloudScale Infrastructure', '', 'Cloud & DevOps', 'High-throughput enterprise Kubernetes and edge compute clusters.', '', 1, 1, 1, 1, 1, 'Elena Rostova', '+1 555-0144', 'elena@cloudscale.net', 'Paid', 4200.00, 'Booked', 'VIP pass requested for CEO keynote speech.', 25.0, 24.0, 9.4, 10.0, 'rect', '#2563eb');
    insertStall.run(zone1Id, 'A-03', 'CyberShield Labs', '', 'Cybersecurity', 'Zero-trust network architecture and real-time threat intelligence.', '', 1, 1, 1, 1, 1, 'David Chen', '+1 555-0188', 'dchen@cybershield.security', 'Pending', 4000.00, 'Reserved', 'Awaiting final contract signoff by Friday.', 14.0, 36.5, 9.4, 10.0, 'rect', '#f59e0b');
    insertStall.run(zone1Id, 'A-04', 'Available Booth', '', 'Available', 'Prime corner booth available for tech exhibitors.', '', 0, 0, 1, 1, 1, '', '', '', 'Unpaid', 3800.00, 'Available', 'Ready for instant booking.', 25.0, 36.5, 9.4, 10.0, 'rect', '#10b981');

    // Zone B Stalls (Aligned with SVG booths in Zone B)
    insertStall.run(zone2Id, 'B-01', 'Artisan Roast & Brew', '', 'Beverages', 'Specialty single-origin espresso, cold brews, and matcha lattes.', '', 1, 1, 1, 1, 1, 'Sophia Martinez', '+1 555-0211', 'sophia@artisanroast.com', 'Paid', 2800.00, 'Booked', 'Needs direct water inlet line.', 65.0, 24.0, 9.4, 10.0, 'rect', '#d97706');
    insertStall.run(zone2Id, 'B-02', 'Urban Green Kitchen', '', 'Food & Dining', 'Organic farm-to-table gourmet bowls, wraps, and gluten-free pastries.', '', 1, 1, 1, 1, 1, 'Liam O Connor', '+1 555-0277', 'liam@urbangreen.co', 'Paid', 3000.00, 'Booked', 'Health inspection certificate verified.', 76.0, 24.0, 9.4, 10.0, 'rect', '#d97706');
    insertStall.run(zone2Id, 'B-03', 'Sweet Wave Gelato', '', 'Desserts', 'Authentic Italian gelato made fresh daily with seasonal fruits.', '', 1, 1, 1, 1, 1, 'Chloe Bennett', '+1 555-0299', 'chloe@sweetwave.it', 'Unpaid', 2500.00, 'Reserved', 'Needs 2x heavy freezer plugs.', 65.0, 36.5, 9.4, 10.0, 'rect', '#f59e0b');

    // Zone C Stalls (VIP Main Stage)
    insertStall.run(zone3Id, 'VIP-1', 'Apex Global Telecom', '', 'Platinum Sponsor', 'Official 5G connectivity partner powering the grand event.', '', 1, 1, 1, 1, 1, 'Victoria Sterling', '+1 555-0900', 'vsterling@apextelecom.com', 'Paid', 15000.00, 'Booked', 'Title sponsor agreement signed. Stage mentions required.', 33.8, 66.8, 15.0, 16.0, 'rounded_rect', '#059669');
    insertStall.run(zone3Id, 'VIP-2', 'Nexus Fintech Holdings', '', 'Gold Sponsor', 'Next-generation merchant payments and digital banking ecosystem.', '', 1, 1, 1, 1, 1, 'Alexander Wright', '+1 555-0911', 'awright@nexusfintech.com', 'Paid', 10000.00, 'Booked', 'Requires 4 branded banner stands around zone perimeter.', 51.0, 66.8, 15.0, 16.0, 'rounded_rect', '#059669');

    console.log('[DB] Seeded default visual zones & visual stalls');
  }

  // Update existing stalls without coordinates
  try {
    const defaultCoords = [
      { id: 1, x: 14.0, y: 24.0, w: 9.4, h: 10.0, shape: 'rect', color: '#2563eb' },
      { id: 2, x: 25.0, y: 24.0, w: 9.4, h: 10.0, shape: 'rect', color: '#2563eb' },
      { id: 3, x: 14.0, y: 36.5, w: 9.4, h: 10.0, shape: 'rect', color: '#f59e0b' },
      { id: 4, x: 25.0, y: 36.5, w: 9.4, h: 10.0, shape: 'rect', color: '#10b981' },
      { id: 5, x: 65.0, y: 24.0, w: 9.4, h: 10.0, shape: 'rect', color: '#d97706' },
      { id: 6, x: 76.0, y: 24.0, w: 9.4, h: 10.0, shape: 'rect', color: '#d97706' },
      { id: 7, x: 65.0, y: 36.5, w: 9.4, h: 10.0, shape: 'rect', color: '#f59e0b' },
      { id: 8, x: 33.8, y: 66.8, w: 15.0, h: 16.0, shape: 'rounded_rect', color: '#059669' },
      { id: 9, x: 51.0, y: 66.8, w: 15.0, h: 16.0, shape: 'rounded_rect', color: '#059669' }
    ];
    defaultCoords.forEach(c => {
      db.prepare('UPDATE stalls SET x = ?, y = ?, width = ?, height = ?, shape = ?, color = ? WHERE id = ? AND (x IS NULL OR x = 0);')
        .run(c.x, c.y, c.w, c.h, c.shape, c.color, c.id);
    });
  } catch (e) {}

  // Record initial audit log
  const auditCount = db.prepare('SELECT COUNT(*) as count FROM audit_logs;').get().count;
  if (auditCount === 0) {
    db.prepare(`
      INSERT INTO audit_logs (user_name, action, entity_type, entity_id, details)
      VALUES ('System', 'INIT', 'SYSTEM', '1', 'Initial database schema and seed data created');
    `).run();
  }
}

module.exports = {
  db,
  initSchema,
  seedInitialData,
  hashPassword,
  verifyPassword
};
