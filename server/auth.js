// server/auth.js
const crypto = require('node:crypto');
const { db, hashPassword, verifyPassword } = require('./db.js');

const SESSION_COOKIE_NAME = 'stall_session';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

// Parse cookies from HTTP request headers
function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (!rc) return list;
  rc.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    if (parts.length >= 2) {
      list[parts.shift().trim()] = decodeURIComponent(parts.join('='));
    }
  });
  return list;
}

// Generate new session token and store in DB
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  
  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at)
    VALUES (?, ?, ?);
  `).run(token, userId, expiresAt);

  // Update user's last login
  db.prepare(`
    UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?;
  `).run(userId);

  return {
    token,
    cookieHeader: `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`
  };
}

// Get user associated with current session
function getSessionUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;

  const now = new Date().toISOString();
  const session = db.prepare(`
    SELECT s.token, s.expires_at, u.id, u.name, u.email, u.role, u.last_login_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > ?
    LIMIT 1;
  `).get(token, now);

  if (!session) return null;

  return {
    id: session.id,
    name: session.name,
    email: session.email,
    role: session.role,
    lastLoginAt: session.last_login_at,
    token: session.token
  };
}

// Invalidate session
function destroySession(token) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token = ?;').run(token);
}

// Clear cookie header string
function getClearCookieHeader() {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

// Authentication middleware for admin API routes
function requireAdminAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Unauthorized: Authentication required to access administrative resources.',
      code: 'AUTH_REQUIRED'
    }));
    return false;
  }
  req.user = user;
  if (next) next();
  return true;
}

module.exports = {
  parseCookies,
  createSession,
  getSessionUser,
  destroySession,
  getClearCookieHeader,
  requireAdminAuth,
  hashPassword,
  verifyPassword,
  SESSION_COOKIE_NAME
};
