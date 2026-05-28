module.exports = {
  apps: [{
    name: 'asterisk-dashboard',
    script: 'server.js',
    watch: false,
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
