// server/index.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

// If you're behind a proxy (cPanel/Passenger, Nginx, etc.), enable this
app.set('trust proxy', 1);

// ---- Request ID (helps trace logs) ----
app.use((req, res, next) => {
  const id = req.headers['x-request-id'] || randomUUID();
  req.id = String(id);
  res.setHeader('X-Request-Id', req.id);
  next();
});

// ---- Logging (dev only) ----
if (!isProd) {
  app.use(morgan(':method :url :status :res[content-length] - :response-time ms :req[x-request-id]'));
}

// ---- CORS (single source of truth) ----
const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'https://admin.nameftrading.com',
  'https://nameftrading.com',
];

const allowedOrigins = (process.env.CORS_ORIGINS || defaultOrigins.join(','))
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      // Allow same-origin / server-to-server / curl/postman with no Origin
      if (!origin) return cb(null, true);

      // Allow common localhost ports automatically in dev
      if (!isProd && /^http:\/\/localhost:(3000|5173|5174)$/.test(origin)) {
        return cb(null, true);
      }

      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-Id'],
    exposedHeaders: ['Content-Length', 'X-Request-Id'],
  })
);

// Preflight handler so OPTIONS never hits rate-limit or auth
app.options('*', cors());

// ---- Security & performance ----
app.use(
  helmet({
    // API only; CSP for front-ends is handled by the static host
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(compression());

// ---- Rate limits ----
// General API limit
app.use(
  '/api/',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isProd ? 100 : 1000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS', // never rate-limit preflight
  })
);

// Stricter limit for login, but relaxed in dev
const authLimiter = isProd
  ? rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.method === 'OPTIONS',
      handler: (req, res, _next, options) => {
        res.status(options.statusCode).json({
          error: 'too_many_requests',
          message: 'Too many login attempts. Try again later.',
          requestId: req.id,
        });
      },
    })
  : rateLimit({
      windowMs: 60 * 1000,
      max: 1000,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.method === 'OPTIONS',
      skipSuccessfulRequests: true,
    });
app.use('/api/auth', authLimiter);

// ---- Body parsers ----
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ---- Health (early & lightweight) ----
app.get('/api/health', (_req, res) => {
  res.json({ status: 'OK', message: 'Stock Management API is running' });
});

// ---- Routes ----
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const stockRoutes = require('./routes/stock');
const orderRoutes = require('./routes/orders');
const dashboardRoutes = require('./routes/dashboard');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/dashboard', dashboardRoutes);


// ---- Health & root endpoints (for cPanel health checks) ----
app.get('/healthz', (req, res) => res.status(200).json({ ok: true, service: 'stock-api', requestId: req.id }));
app.get('/', (req, res) => res.status(200).json({ ok: true, message: 'Stock API root', time: new Date().toISOString() }));

// ---- 404 for unknown API routes ----
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'not_found', path: req.path, requestId: req.id });
});

// ---- Error handlers ----
app.use((err, _req, res, _next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'forbidden', message: err.message });
  }
  const status = err.status || 500;
  if (!isProd) {
    // Detailed in dev
    return res.status(status).json({
      error: 'server_error',
      message: err.message,
      stack: err.stack,
    });
  }
  // Sanitized in prod
  return res.status(status).json({
    error: 'server_error',
    message: 'An unexpected error occurred.',
  });
});

// ---- Start server ----
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
