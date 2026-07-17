const { test, after, describe } = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');

const { createApp } = require('../server');

const { server } = createApp();

const TEST_PORT = 9877;

function connectWs() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function waitForMessage(ws) {
  return new Promise((resolve) => {
    ws.once('message', (data) => {
      resolve(JSON.parse(data.toString()));
    });
  });
}

function sendAndReceive(ws, msg) {
  return new Promise((resolve) => {
    ws.once('message', (data) => {
      resolve(JSON.parse(data.toString()));
    });
    ws.send(JSON.stringify(msg));
  });
}

// Start server
server.listen(TEST_PORT);

after(() => {
  return new Promise((resolve) => server.close(resolve));
});

describe('WebSocket connection management', () => {
  test('connection receives a connected message with playerId', async () => {
    const ws = await connectWs();
    const msg = await waitForMessage(ws);
    assert.strictEqual(msg.type, 'connected');
    assert.ok(msg.playerId);
    // UUID format check
    assert.match(msg.playerId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    ws.close();
  });

  test('multiple connections get unique playerIds', async () => {
    const ws1 = await connectWs();
    const ws2 = await connectWs();
    const ws3 = await connectWs();

    const msg1 = await waitForMessage(ws1);
    const msg2 = await waitForMessage(ws2);
    const msg3 = await waitForMessage(ws3);

    const ids = new Set([msg1.playerId, msg2.playerId, msg3.playerId]);
    assert.strictEqual(ids.size, 3, 'All player IDs should be unique');

    ws1.close();
    ws2.close();
    ws3.close();
  });

  test('sending valid JSON gets a response', async () => {
    const ws = await connectWs();
    // consume the connected message
    await waitForMessage(ws);

    const response = await sendAndReceive(ws, { type: 'ping' });
    assert.strictEqual(response.type, 'error');
    assert.ok(response.message.includes('Unknown message type'));
    ws.close();
  });

  test('sending invalid JSON returns an error message', async () => {
    const ws = await connectWs();
    // consume the connected message
    await waitForMessage(ws);

    const response = new Promise((resolve) => {
      ws.once('message', (data) => resolve(JSON.parse(data.toString())));
    });
    ws.send('this is not json{{{');
    const msg = await response;
    assert.strictEqual(msg.type, 'error');
    assert.strictEqual(msg.message, 'Invalid message format');
    ws.close();
  });

  test('unrecognized message type returns error', async () => {
    const ws = await connectWs();
    await waitForMessage(ws); // consume connected

    const response = await sendAndReceive(ws, { type: 'nonexistent' });
    assert.strictEqual(response.type, 'error');
    assert.ok(response.message.includes('nonexistent'));
    ws.close();
  });
});
