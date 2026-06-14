const todoComments = require('./todo-comments');
const oversizedFile = require('./oversized-file');
const deadExport = require('./dead-export');
const dependencyFreshness = require('./dependency-freshness');
const projectCommand = require('./project-command');

// Registry order is the default run order. project-command is registered but
// not in the default set (DEFAULT_IDS) because it requires explicit config.
const ALL_LENSES = [todoComments, oversizedFile, deadExport, dependencyFreshness, projectCommand];
const DEFAULT_IDS = ['todo-comments', 'oversized-file', 'dead-export', 'dependency-freshness'];

// Returns the active lens set. With config.enabledLenses (string[]), returns
// only those ids in the given order; otherwise the default mechanical set.
function buildLenses(config) {
  const enabled = config && Array.isArray(config.enabledLenses) && config.enabledLenses.length
    ? config.enabledLenses
    : DEFAULT_IDS;
  return enabled.map((id) => ALL_LENSES.find((l) => l.id === id)).filter(Boolean);
}

module.exports = { ALL_LENSES, DEFAULT_IDS, buildLenses };
