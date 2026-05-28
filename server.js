require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const BASE = (process.env.BASE_PATH || '').replace(/\/+$/, '');

function serveIndex(_req, res) {
  const html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8')
    .replace('<head>', `<head>\n    <base href="${BASE}/">\n    <script>window.BASE_PATH="${BASE}";</script>`);
  res.type('html').send(html);
}

app.use(express.json());
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
