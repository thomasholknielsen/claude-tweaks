const todoComments = require('./todo-comments');
const oversizedFile = require('./oversized-file');
const deadExport = require('./dead-export');
const dependencyFreshness = require('./dependency-freshness');
const projectCommand = require('./project-command');

// Registry order is the default run order. project-command is registered but
// not in the default set (DEFAULT_IDS) because it requires explicit config.
const ALL_LENSES = [todoComments, oversizedFile, deadExport, dependencyFreshness, projectCommand];
const DEFAULT_IDS = ['todo-comments', 'oversized-file', 'dead-export', 'dependency-freshness'];

// Lenses are demoted from the run spine in v2. The v2 SKILL drives the LLM
// judge directly; lenses are retained only as optional tools it may call as
// evidence. buildLenses returns [] so nothing treats lenses as the run spine.
function buildLenses(_config) { return []; }

module.exports = { ALL_LENSES, DEFAULT_IDS, buildLenses };
