require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const session = require('express-session');

const app = express();
const BASE = (process.env.BASE_PATH || '').replace(/\/+$/, '');

function loginPage(base, error) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>1COM Central – Login</title>
  <base href="${base}/">
  <link rel="stylesheet" href="assets/vendor/css/core.css">
  <link rel="stylesheet" href="assets/css/demo.css">
  <style>
    body { background: #f4f5fb; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .login-card { width: 100%; max-width: 420px; }
  </style>
</head>
<body>
  <div class="login-card">
    <div class="card shadow-sm">
      <div class="card-body p-4">
        <h5 class="card-title text-center mb-4">1COM Central</h5>
        ${error ? `<div class="alert alert-danger py-2">${error}</div>` : ''}
        <form method="POST" action="${base}/login">
          <div class="mb-3">
            <label class="form-label">Username</label>
            <input type="text" name="username" class="form-control" autofocus autocomplete="username">
          </div>
          <div class="mb-3">
            <label class="form-label">Password</label>
            <input type="password" name="password" class="form-control" autocomplete="current-password">
          </div>
          <button type="submit" class="btn btn-primary w-100">Sign in</button>
        </form>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function requireAuth(req, res, next) {
  if (process.env.NODE_ENV === 'test' || req.session.authenticated) return next();
  res.redirect(BASE + '/login');
}

function serveIndex(_req, res) {
  const html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8')
    .replace('<head>', `<head>\n    <base href="${BASE}/">\n    <script>window.BASE_PATH="${BASE}";</script>`);
  res.type('html').send(html);
}

app.use(session({
  secret: process.env.SESSION_SECRET || 'changeme',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' },
}));

app.use(express.json());

// Login routes — unauthenticated
app.get(BASE + '/login', (req, res) => {
  if (req.session.authenticated) return res.redirect(BASE + '/');
  res.type('html').send(loginPage(BASE));
});

app.post(BASE + '/login', express.urlencoded({ extended: false }), (req, res) => {
  const { username, password } = req.body;
  const expectedUser = process.env.ADMIN_USER || 'admin';
  const expectedHash = process.env.ADMIN_PASSWORD_HASH || '';
  const inputHash = crypto.createHash('sha256').update(password || '').digest('hex');

  let match = false;
  if (username === expectedUser && expectedHash.length === 64) {
    try {
      match = crypto.timingSafeEqual(Buffer.from(expectedHash, 'hex'), Buffer.from(inputHash, 'hex'));
    } catch (_) {}
  }

  if (match) {
    req.session.authenticated = true;
    return res.redirect(BASE + '/');
  }
  res.type('html').send(loginPage(BASE, 'Invalid username or password'));
});

app.get(BASE + '/logout', (req, res) => {
  req.session.destroy(() => res.redirect(BASE + '/login'));
});

// All routes below require auth
app.use(requireAuth);

app.get(BASE ? [BASE, BASE + '/'] : '/', serveIndex);
app.get(BASE + '/api/version', (req, res) => res.json({ version: require('./package.json').version }));
app.use(BASE, express.static(path.join(__dirname, 'public')));
app.use(BASE + '/api/nodes', require('./routes/nodes'));

if (require.main === module) {
  require('./poller').startPoller();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Dashboard running on :${PORT}`));
}

module.exports = app;
