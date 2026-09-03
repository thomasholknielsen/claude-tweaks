// bin/lib/ports/probe.js — bind-probe verification for the ports registry
// (bin/lib/ports/registry.js). A port is "free" iff this process can bind a
// TCP listener to it on the loopback interface; on Windows a port already
// bound on 0.0.0.0 by another process still fails a 127.0.0.1 bind attempt,
// which is exactly the collision this module exists to catch.
'use strict';

const net = require('net');

// port -> Promise<boolean>. Never rejects — a bind failure (EADDRINUSE,
// EACCES, or anything else) resolves false; anything else is "free".
function isFree(port, { host = '127.0.0.1' } = {}) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

// Is every port in [base, base + size) free? Short-circuits are avoided —
// every port is probed (and its listener released) regardless of an earlier
// failure, so a caller retrying a different candidate block never leaves a
// listener bound on a port it has already decided not to use.
async function blockFree(base, { size = 10, host } = {}) {
  const results = await Promise.all(
    Array.from({ length: size }, (_, i) => isFree(base + i, { host })),
  );
  return results.every(Boolean);
}

module.exports = { isFree, blockFree };
