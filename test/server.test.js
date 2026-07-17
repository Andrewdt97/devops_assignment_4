const { test, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { createApp } = require('../server');

const { server } = createApp();

const TEST_PORT = 9876;

function request(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${TEST_PORT}${path}`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}

// Start the server for testing
server.listen(TEST_PORT);

after(() => {
  return new Promise((resolve) => server.close(resolve));
});

test('server starts and listens', async () => {
  const res = await request('/');
  assert.strictEqual(res.statusCode, 200);
});

test('GET / serves index.html', async () => {
  const res = await request('/');
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.headers['content-type'], 'text/html');
  assert.ok(res.body.includes('Poker Game'));
});

test('GET /style.css serves CSS file', async () => {
  const res = await request('/style.css');
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.headers['content-type'], 'text/css');
});

test('GET /app.js serves JavaScript file', async () => {
  const res = await request('/app.js');
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.headers['content-type'], 'application/javascript');
});

test('GET /nonexistent returns 404', async () => {
  const res = await request('/nonexistent');
  assert.strictEqual(res.statusCode, 404);
  assert.strictEqual(res.body, 'Not Found');
});

test('directory traversal is blocked', async () => {
  const res = await request('/../package.json');
  // The path normalization by http module makes this serve as /package.json
  // which doesn't exist in public/, so it should be 404
  assert.ok(res.statusCode === 404 || res.statusCode === 403);
});
