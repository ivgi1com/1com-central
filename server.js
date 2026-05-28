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
<html lang="en" class="light-style customizer-hide" data-assets-path="${base}/assets/" data-template="vertical-menu-template-free">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, minimum-scale=1.0, maximum-scale=1.0">
  <title>1COM Central – Sign In</title>
  <link rel="icon" type="image/x-icon" href="${base}/assets/img/favicon/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Public+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${base}/assets/vendor/fonts/iconify-icons.css">
  <link rel="stylesheet" href="${base}/assets/vendor/css/core.css">
  <link rel="stylesheet" href="${base}/assets/css/demo.css">
  <link rel="stylesheet" href="${base}/assets/vendor/css/pages/page-auth.css">
  <script src="${base}/assets/vendor/js/helpers.js"></script>
  <script src="${base}/assets/js/config.js"></script>
</head>
<body>
  <div class="authentication-wrapper authentication-basic container-p-y">
    <div class="authentication-inner py-6">
      <div class="card">
        <div class="card-body">
          <div class="app-brand justify-content-center mb-6">
            <span class="app-brand-logo demo">
              <span class="text-primary">
                <svg width="25" height="25" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="8" cy="8" r="8" fill="currentColor" fill-opacity="0.12"/>
                  <path d="M1.885.511a1.745 1.745 0 0 1 2.61.163L6.29 2.98c.329.423.445.974.315 1.494l-.547 2.19a.678.678 0 0 0 .178.643l2.457 2.457a.678.678 0 0 0 .644.178l2.189-.547a1.745 1.745 0 0 1 1.494.315l2.306 1.794c.829.645.905 1.87.163 2.611l-1.034 1.034c-.74.74-1.846 1.065-2.877.702a18.634 18.634 0 0 1-7.01-4.42 18.634 18.634 0 0 1-4.42-7.009c-.362-1.03-.037-2.137.703-2.877L1.885.511z" fill="currentColor"/>
                </svg>
              </span>
            </span>
            <span class="app-brand-text demo fw-bold ms-2 fs-4">1COM Central</span>
          </div>
          <h4 class="mb-1">Welcome</h4>
          <p class="mb-6 text-muted">Sign in to your account</p>
          ${error ? `<div class="alert alert-danger d-flex align-items-center mb-4" role="alert">
            <i class="bx bx-error-circle me-2 fs-5"></i>${error}
          </div>` : ''}
          <form method="POST" action="${base}/login">
            <div class="mb-4">
              <label class="form-label">Username</label>
              <input type="text" name="username" class="form-control" placeholder="Enter your username" autofocus autocomplete="username">
            </div>
            <div class="mb-6">
              <label class="form-label">Password</label>
              <div class="input-group input-group-merge">
                <input type="password" id="password" name="password" class="form-control" placeholder="••••••••" autocomplete="current-password">
                <span class="input-group-text cursor-pointer" onclick="togglePwd()">
                  <i id="pwd-icon" class="bx bx-hide"></i>
                </span>
              </div>
            </div>
            <button type="submit" class="btn btn-primary d-grid w-100">Sign in</button>
          </form>
        </div>
      </div>
    </div>
  </div>
  <script>
    function togglePwd() {
      var inp = document.getElementById('password');
      var ico = document.getElementById('pwd-icon');
      if (inp.type === 'password') { inp.type = 'text'; ico.className = 'bx bx-show'; }
      else { inp.type = 'password'; ico.className = 'bx bx-hide'; }
    }
  </script>
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

// Static assets are public (login page needs CSS/JS before auth)
app.use(BASE + '/assets', express.static(path.join(__dirname, 'public/assets')));

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
