'use strict';

function buildUserLookupQuery(username) {
  const safeUsername = username.replace(/[^a-zA-Z0-9_]/g, '');
  return `SELECT * FROM users WHERE username = '${safeUsername}'`;
}

module.exports = { buildUserLookupQuery };
