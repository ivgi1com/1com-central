require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();

app.use(express.json());
app.get('/api/version', (req, res) => res.json({ version: require('./package.json').version }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/nodes', require('./routes/nodes'));

if (require.main === module) {
  require('./poller').startPoller();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Dashboard running on :${PORT}`));
}

module.exports = app;
