// server/realtime.js
const { getSessionUser } = require('./auth.js');

class RealtimeHub {
  constructor() {
    this.publicClients = new Set();
    this.adminClients = new Set();

    // Start 15s keep-alive heartbeat
    setInterval(() => {
      this.heartbeat();
    }, 15000);
  }

  // Handle new incoming SSE connection
  handleConnection(req, res) {
    const user = getSessionUser(req);
    const isAdmin = !!user;

    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable proxy buffering (Nginx, Vercel)
      'Access-Control-Allow-Origin': '*'
    });

    const client = {
      id: Math.random().toString(36).substring(2, 10),
      res,
      user: user || null,
      isAdmin,
      connectedAt: new Date()
    };

    if (isAdmin) {
      this.adminClients.add(client);
      console.log(`[Realtime] Admin connected (${client.id} - ${user.email}) | Total Admins: ${this.adminClients.size}`);
    } else {
      this.publicClients.add(client);
      console.log(`[Realtime] Public client connected (${client.id}) | Total Public: ${this.publicClients.size}`);
    }

    // Send initial handshake
    this.sendToClient(client, 'CONNECTED', {
      clientId: client.id,
      role: isAdmin ? 'admin' : 'public',
      timestamp: new Date().toISOString()
    });

    // Cleanup on disconnect
    req.on('close', () => {
      if (isAdmin) {
        this.adminClients.delete(client);
        console.log(`[Realtime] Admin disconnected (${client.id})`);
      } else {
        this.publicClients.delete(client);
        console.log(`[Realtime] Public client disconnected (${client.id})`);
      }
    });
  }

  // Send SSE payload to a specific client
  sendToClient(client, event, data) {
    try {
      client.res.write(`event: ${event}\n`);
      client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      // Client likely dropped connection
    }
  }

  // Heartbeat keepalive
  heartbeat() {
    const payload = `: ping\n\n`;
    for (const client of this.publicClients) {
      try { client.res.write(payload); } catch (e) {}
    }
    for (const client of this.adminClients) {
      try { client.res.write(payload); } catch (e) {}
    }
  }

  // Broadcast sanitized update to public clients ONLY
  broadcastPublic(event, publicData) {
    for (const client of this.publicClients) {
      this.sendToClient(client, event, publicData);
    }
  }

  // Broadcast full update to admin clients ONLY
  broadcastAdmin(event, adminData) {
    for (const client of this.adminClients) {
      this.sendToClient(client, event, adminData);
    }
  }

  // Broadcast both channels with strict separation
  broadcast(event, publicData, adminData) {
    if (publicData !== undefined && publicData !== null) {
      this.broadcastPublic(event, publicData);
    }
    if (adminData !== undefined && adminData !== null) {
      this.broadcastAdmin(event, adminData);
    }
  }

  // Helper to get connection counts for admin dashboard
  getStats() {
    return {
      publicConnections: this.publicClients.size,
      adminConnections: this.adminClients.size
    };
  }
}

const realtimeHub = new RealtimeHub();
module.exports = realtimeHub;
