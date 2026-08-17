const ESC = '\x1b[';
const RESET = `${ESC}0m`;

function colorEnabled() {
  // Per the NO_COLOR convention (https://no-color.org/), the variable's mere
  // presence suppresses color, regardless of its value — including
  // `NO_COLOR=` (present but empty).
  const noColor = process.env.NO_COLOR;
  if (noColor !== undefined) return false;
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
