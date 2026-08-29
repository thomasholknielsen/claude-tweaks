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

// OSC 8 hyperlink, BEL-terminated (the form Claude Code's statusline docs
// show). Not gated on NO_COLOR — that convention governs color (SGR), not
// hyperlinks — and terminals without OSC 8 support render the text plain.
const link = (url, s) => `\x1b]8;;${url}\x07${s}\x1b]8;;\x07`;

module.exports = { red, yellow, green, dim, link, colorEnabled };
