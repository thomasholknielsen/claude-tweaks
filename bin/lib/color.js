const ESC = '\x1b[';
const RESET = `${ESC}0m`;

function colorEnabled() {
  const noColor = process.env.NO_COLOR;
  if (noColor !== undefined && noColor !== '') return false;
  return true;
}

function wrap(code, s) {
  if (!colorEnabled()) return s;
  return `${ESC}${code}m${s}${RESET}`;
}

const red = (s) => wrap('31', s);
const yellow = (s) => wrap('33', s);
const green = (s) => wrap('32', s);
const dim = (s) => wrap('2', s);

module.exports = { red, yellow, green, dim, colorEnabled };
