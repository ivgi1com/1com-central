const request = require('supertest');
const app = require('../server');

describe('Static file server', () => {
  it('GET / returns 200 with HTML', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });

  it('GET /assets/css/demo.css returns 200', async () => {
    const res = await request(app).get('/assets/css/demo.css');
    expect(res.status).toBe(200);
  });
});
