'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const { isFree, blockFree } = require('../../../plugin/bin/lib/ports/probe');

function listenOn(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

test('isFree: true for an unbound port, false for one this process has bound', async () => {
  const server = await listenOn(21001);
  try {
    assert.equal(await isFree(21001), false);
    assert.equal(await isFree(21002), true);
  } finally {
    server.close();
  }
});

test('blockFree: true only when every port in the block is free', async () => {
  assert.equal(await blockFree(21010, { size: 5 }), true);
  const server = await listenOn(21013);
  try {
    assert.equal(await blockFree(21010, { size: 5 }), false);
  } finally {
    server.close();
  }
});

test('blockFree: probes every port even after an early failure (no listener leaked on later ports)', async () => {
  const server = await listenOn(21020);
  try {
    assert.equal(await blockFree(21020, { size: 3 }), false);
    // If a later port had been left bound by a short-circuited probe, this
    // second full-block check (from a fresh listener at the same ports)
    // would itself fail with EADDRINUSE rather than resolving false cleanly.
    assert.equal(await blockFree(21021, { size: 2 }), true);
  } finally {
    server.close();
  }
});
