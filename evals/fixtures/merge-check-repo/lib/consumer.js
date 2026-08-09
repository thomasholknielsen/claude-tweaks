const { renderLabel } = require('./render');

const DEFAULT_LIMIT = 10;

function summarize(items) {
  return items.slice(0, DEFAULT_LIMIT).map(renderLabel).join(', ');
}

module.exports = { summarize };
