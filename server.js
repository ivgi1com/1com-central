const express = require('express');
const path = require('path');

const app = express();

app.use(express.static(path.join(__dirname, 'public')));

if (require.main === module) {
  app.listen(3000, () => console.log('Dashboard running on :3000'));
}

module.exports = app;
