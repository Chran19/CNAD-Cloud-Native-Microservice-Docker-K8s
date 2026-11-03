/**
 * CloudScale Microservice - Server Implementation
 * 
 * A robust, cloud-native Node.js web application designed for containerized
 * deployment in Docker and orchestration via Kubernetes.
 * 
 * Features:
 * - Native zero-dependency HTTP server for maximum security and minimal attack surface
 * - Liveness and Readiness Probe endpoint (/healthz) compliant with Kubernetes standards
 * - System metrics & environment inspection API (/api/system) for container diagnostics
 * - Interactive In-Memory REST API (/api/tasks) for task management
 * - Graceful shutdown handling for SIGTERM and SIGINT (Zero-downtime rolling updates)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// In-memory task repository for demo functionality
let tasks = [
  { id: 1, title: 'Containerize application with Dockerfile', completed: true, timestamp: new Date().toISOString() },
  { id: 2, title: 'Build custom Docker image & verify container', completed: true, timestamp: new Date().toISOString() },
  { id: 3, title: 'Create Kubernetes Deployment manifest', completed: true, timestamp: new Date().toISOString() },
  { id: 4, title: 'Configure Kubernetes NodePort Service', completed: true, timestamp: new Date().toISOString() },
  { id: 5, title: 'Deploy on Kubernetes cluster and verify pods', completed: false, timestamp: new Date().toISOString() }
];

// In-memory request log buffer (recent 15 requests)
const requestLogs = [];

function recordLog(method, url, statusCode, durationMs) {
  const logEntry = {
    time: new Date().toLocaleTimeString(),
    method,
    url,
    statusCode,
    durationMs: durationMs.toFixed(1)
  };
  requestLogs.unshift(logEntry);
  if (requestLogs.length > 20) {
    requestLogs.pop();
  }
}

// MIME types lookup for static assets
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

// Helper: Parse JSON request body
function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 1e6) { // 1MB limit
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

// Request dispatcher
const server = http.createServer(async (req, res) => {
  const startTime = process.hrtime();
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Add CORS and security headers
  res.setHeader('X-Powered-By', 'CloudScale-Microservice');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Hook for logging after response completes
  res.on('finish', () => {
    const diff = process.hrtime(startTime);
    const durationMs = (diff[0] * 1e3) + (diff[1] / 1e6);
    recordLog(req.method, pathname, res.statusCode, durationMs);
  });

  try {
    // -------------------------------------------------------------
    // Route 1: Kubernetes Liveness / Readiness & Health Probe Endpoint
    // -------------------------------------------------------------
    if (pathname === '/healthz' || pathname === '/api/health') {
      const memoryUsage = process.memoryUsage();
      const healthData = {
        status: 'UP',
        healthy: true,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        service: 'cloudscale-microservice',
        nodeVersion: process.version,
        podName: process.env.POD_NAME || os.hostname(),
        checks: {
          memory: {
            status: memoryUsage.heapUsed < 500 * 1024 * 1024 ? 'OK' : 'HIGH_MEMORY',
            heapUsedMB: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
            heapTotalMB: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2)
          },
          process: {
            pid: process.pid,
            status: 'OK'
          }
        }
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(healthData, null, 2));
      return;
    }

    // -------------------------------------------------------------
    // Route 2: System & Container Diagnostics API
    // -------------------------------------------------------------
    if (pathname === '/api/system') {
      const memTotal = os.totalmem();
      const memFree = os.freemem();
      const memUsed = memTotal - memFree;
      const memUsagePct = ((memUsed / memTotal) * 100).toFixed(1);

      const systemData = {
        application: {
          name: 'CloudScale Microservice Dashboard',
          version: '1.0.0',
          environment: process.env.NODE_ENV || 'production',
          nodeVersion: process.version,
          port: PORT,
          processUptimeSeconds: Math.floor(process.uptime())
        },
        container: {
          hostname: os.hostname(),
          podName: process.env.POD_NAME || os.hostname(),
          podNamespace: process.env.POD_NAMESPACE || 'default',
          podIP: process.env.POD_IP || '127.0.0.1',
          nodeName: process.env.NODE_NAME || os.hostname()
        },
        hardware: {
          platform: os.platform(),
          release: os.release(),
          arch: os.arch(),
          cpuCount: os.cpus().length,
          cpuModel: os.cpus()[0]?.model || 'Generic CPU',
          systemUptimeSeconds: Math.floor(os.uptime()),
          memory: {
            totalMB: Math.floor(memTotal / (1024 * 1024)),
            usedMB: Math.floor(memUsed / (1024 * 1024)),
            freeMB: Math.floor(memFree / (1024 * 1024)),
            usagePercent: memUsagePct
          }
        },
        recentLogs: requestLogs.slice(0, 8)
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(systemData, null, 2));
      return;
    }

    // -------------------------------------------------------------
    // Route 3: REST API - Tasks Endpoints (/api/tasks)
    // -------------------------------------------------------------
    if (pathname === '/api/tasks') {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: tasks.length, data: tasks }));
        return;
      }

      if (req.method === 'POST') {
        const body = await parseRequestBody(req);
        if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Task title is required' }));
          return;
        }

        const newTask = {
          id: Date.now(),
          title: body.title.trim(),
          completed: false,
          timestamp: new Date().toISOString()
        };

        tasks.unshift(newTask);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: newTask }));
        return;
      }
    }

    // Specific task route: /api/tasks/:id (toggle completion or delete)
    if (pathname.startsWith('/api/tasks/')) {
      const taskId = parseInt(pathname.split('/')[3], 10);
      const taskIndex = tasks.findIndex(t => t.id === taskId);

      if (taskIndex === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Task not found' }));
        return;
      }

      if (req.method === 'DELETE') {
        const removed = tasks.splice(taskIndex, 1)[0];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: removed }));
        return;
      }

      if (req.method === 'POST') { // Toggle complete
        tasks[taskIndex].completed = !tasks[taskIndex].completed;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: tasks[taskIndex] }));
        return;
      }
    }

    // Ping endpoint for network/probe latency test
    if (pathname === '/api/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ pong: true, time: Date.now() }));
      return;
    }

    // -------------------------------------------------------------
    // Route 4: Static File Serving (public/ directory)
    // -------------------------------------------------------------
    let filePath = pathname === '/' ? '/index.html' : pathname;
    const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(__dirname, 'public', safePath);

    fs.stat(fullPath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>404 Not Found</h1><p>The requested path <code>${pathname}</code> was not found on this server.</p>`);
        return;
      }

      const ext = path.extname(fullPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      const stream = fs.createReadStream(fullPath);
      stream.pipe(res);
    });

  } catch (error) {
    console.error('Unhandled request error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Internal Server Error' }));
  }
});

// Start listening
server.listen(PORT, HOST, () => {
  console.log(`====================================================`);
  console.log(` CloudScale Microservice listening on http://${HOST}:${PORT}`);
  console.log(` Healthcheck: http://${HOST}:${PORT}/healthz`);
  console.log(` System API:  http://${HOST}:${PORT}/api/system`);
  console.log(` Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log(` Container ID: ${os.hostname()}`);
  console.log(`====================================================`);
});

// Graceful shutdown handling for container termination
function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('HTTP server closed. Exiting process.');
    process.exit(0);
  });

  // Force close if open connections take too long
  setTimeout(() => {
    console.error('Forcefully terminating server after timeout.');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
