'use strict';

function formatUserName(first, last) {
  const trimmedFirst = first.trim();
  const trimmedLast = last.trim();
  return `${trimmedFirst} ${trimmedLast}`;
}

function formatAdminName(first, last) {
  const trimmedFirst = first.trim();
  const trimmedLast = last.trim();
  return `${trimmedFirst} ${trimmedLast}`;
}

module.exports = { formatUserName, formatAdminName };
