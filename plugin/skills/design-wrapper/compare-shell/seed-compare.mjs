#!/usr/bin/env node
// seed-compare.mjs — stamps design-wrapper's compare-shell template.html with
// one round's variant manifest, producing either a live-served shell (iframes
// src-reference files served by visual-decide, #1202) or a durable,
// fully self-contained decision record (every variant embedded via a JSON
// island the template's own JS turns into `iframe.srcdoc` assignments —
// property assignment, not an HTML attribute, so no manual attribute
// escaping is needed; only a literal `</script` sequence inside embedded
// content must be neutralized so it can't end the containing <script>
// element). Node builtins only (#1203).
//
// Usage: seed-compare.mjs --manifest <manifest.json> --mode live|durable --out <path>
//
// Manifest schema — see plugin/skills/_shared/visual-decision.md (#1204) for
// the event vocabulary this shell's verdict bar emits; this file owns only
// the manifest/template contract:
//   {
//     scope: "identity" | "layout",
//     seedKey, rerollCount, steerHistory: [...],
//     sharedMarkup?: path,              // identity scope only
//     variants: [{ id, name, files: [path...], degraded?, reason? }],
//     outcome?: { winner, date }        // required in durable mode
//     tweaks?: [{ token, value }]       // durable mode only — baked into
//                                       // outcome.tweaks; see
//                                       // plugin/skills/_shared/visual-decision.md's
//                                       // tweak event
//   }
// All paths are relative to the manifest's own directory.
//
// Live-tweak opt-in (#1336): template.html's live focus view postMessages
// {type: 'compare-shell-tweak', token, value} into the focused candidate's
// own iframe on every tweak-lever change. This file does NOT inject a
// listener into variant markup — a candidate opts in by adding its own, e.g.:
//   window.addEventListener('message', function (e) {
//     if (!e.data || e.data.type !== 'compare-shell-tweak') return;
//     document.documentElement.style.setProperty('--tweak-' + e.data.token, e.data.value);
//   });
// then styling itself off the same --tweak-{hue,spacing-scale,corner-radius}
// custom properties the compare-shell's own preview swatch uses. A variant
// that adds no such listener renders exactly as it does today — the message
// is sent but nothing reads it. Deliberately not auto-injected here: this
// file's job is assembling a variant's own already-authored files/skin CSS
// (buildVariantData above) into a served or embedded document, not mutating
// arbitrary — possibly malformed — candidate markup with bootstrap script
// injection, which the identity-scope `</head>`-detection code above already
// shows is not a risk-free pattern to repeat for every variant unconditionally.
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const TEMPLATE_PATH = path.join(path.dirname(url.fileURLToPath(import.meta.url)), 'template.html');
const SIZE_WARNING_BYTES = 2 * 1024 * 1024;

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      opts[token.slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return opts;
}

class SeedError extends Error {}

function readManifest(manifestPath) {
  let raw;
  try {
    raw = fs.readFileSync(manifestPath, 'utf8');
  } catch (err) {
    throw new SeedError(`cannot read manifest ${manifestPath}: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new SeedError(`manifest ${manifestPath} is not valid JSON: ${err.message}`);
  }
}

function resolveManifestPath(manifestDir, relPath) {
  return path.join(manifestDir, relPath);
}

function assertFileExists(manifestDir, relPath, context) {
  const full = resolveManifestPath(manifestDir, relPath);
  if (!fs.existsSync(full)) {
    throw new SeedError(`${context}: missing artifact file ${relPath} (resolved ${full})`);
  }
  return full;
}

function validateManifest(manifest, mode, manifestDir) {
  if (!Array.isArray(manifest.variants) || manifest.variants.length === 0) {
    throw new SeedError('manifest.variants must be a non-empty array');
  }
  const seen = new Set();
  for (const variant of manifest.variants) {
    if (!variant.id) throw new SeedError('every variant needs an id');
    if (seen.has(variant.id)) throw new SeedError(`duplicate variant id: ${variant.id}`);
    seen.add(variant.id);
  }

  if (manifest.scope === 'identity' && manifest.sharedMarkup) {
    assertFileExists(manifestDir, manifest.sharedMarkup, 'sharedMarkup');
  }
  for (const variant of manifest.variants) {
    if (variant.degraded) continue;
    for (const file of variant.files || []) {
      assertFileExists(manifestDir, file, `variant ${variant.id}`);
    }
  }

  if (mode === 'durable') {
    if (!manifest.outcome) {
      throw new SeedError('durable mode requires manifest.outcome');
    }
    if (!seen.has(manifest.outcome.winner)) {
      throw new SeedError(`outcome.winner "${manifest.outcome.winner}" not found among variants[].id`);
    }
    // manifest.tweaks is durable-mode only (see the header comment) — live
    // mode never bakes it into DATA at all, so validating it there would
    // refuse manifests over a field that's silently dropped anyway.
    if (manifest.tweaks !== undefined) {
      if (!Array.isArray(manifest.tweaks)) {
        throw new SeedError('manifest.tweaks must be an array of { token, value } entries');
      }
      for (const tweak of manifest.tweaks) {
        if (typeof tweak !== 'object' || tweak === null || typeof tweak.token !== 'string' || typeof tweak.value !== 'string') {
          throw new SeedError(`manifest.tweaks entry ${JSON.stringify(tweak)} must have string token and value fields`);
        }
      }
    }
  }
}

// Inserts skinCss inline before the shared markup's </head> — or, absent a
// </head>, prepends it — so identity-scope durable srcdoc documents carry
// the shared markup plus exactly that variant's own skin, never a sibling's.
// #1435: the replacement is passed as a function, not a plain string —
// skinCssText is arbitrary variant-authored content, and String.replace's
// string-replacement grammar treats a raw `$`-prefixed sequence in a literal
// replacement argument as a splice directive ($` = "everything before the
// match") rather than literal text, corrupting the assembled document if the
// CSS ever contains one. A function replacer's return value is inserted
// verbatim, sidestepping that grammar entirely (mirrors __VARIANT_DATA__'s
// existing function-replacer fix for #1229, applied here to the other
// string-replace call site in this same file).
function assembleIdentityDoc(sharedMarkupText, skinCssText) {
  const styleBlock = `<style>${skinCssText}</style>`;
  if (sharedMarkupText.includes('</head>')) {
    return sharedMarkupText.replace('</head>', () => `${styleBlock}</head>`);
  }
  return styleBlock + sharedMarkupText;
}

const ASSEMBLED_DIR_NAME = '.vd-assembled';

function buildVariantData(manifest, mode, manifestDir, outDir) {
  const sharedMarkupText = manifest.scope === 'identity' && manifest.sharedMarkup
    ? fs.readFileSync(resolveManifestPath(manifestDir, manifest.sharedMarkup), 'utf8')
    : null;

  return manifest.variants.map((variant) => {
    const base = { id: variant.id, name: variant.name || variant.id, degraded: Boolean(variant.degraded) };
    if (variant.degraded) {
      return { ...base, reason: variant.reason || 'degraded' };
    }
    if (mode === 'live') {
      if (manifest.scope === 'identity') {
        // identity scope's `variants[].files[0]` is a skin CSS path, not a
        // standalone page — an iframe can't usefully src= a raw stylesheet.
        // Assemble the same shared-markup-plus-skin document durable mode
        // builds (assembleIdentityDoc below), write it to disk inside the
        // served directory, and iframe-src that instead (review finding:
        // the un-assembled path left identity-scope live comparison
        // entirely broken — every grid/focus frame just rendered CSS text).
        const skinCssText = fs.readFileSync(
          resolveManifestPath(manifestDir, (variant.files || [])[0]),
          'utf8',
        );
        // Written next to --out (the served round dir in real usage), never
        // into manifestDir — the manifest can legitimately live outside the
        // served tree (e.g. a fixtures directory in tests), and this
        // generated artifact must not land there.
        const assembledDoc = assembleIdentityDoc(sharedMarkupText, skinCssText);
        const assembledDir = path.join(outDir, ASSEMBLED_DIR_NAME);
        fs.mkdirSync(assembledDir, { recursive: true });
        const assembledRelPath = `${ASSEMBLED_DIR_NAME}/${variant.id}.html`;
        fs.writeFileSync(path.join(outDir, assembledRelPath), assembledDoc);
        return { ...base, src: assembledRelPath };
      }
      const relFile = (variant.files || [])[0];
      return { ...base, src: relFile };
    }
    // durable
    if (manifest.scope === 'identity') {
      const skinCssText = fs.readFileSync(
        resolveManifestPath(manifestDir, (variant.files || [])[0]),
        'utf8',
      );
      return { ...base, content: assembleIdentityDoc(sharedMarkupText, skinCssText) };
    }
    const markupText = fs.readFileSync(
      resolveManifestPath(manifestDir, (variant.files || [])[0]),
      'utf8',
    );
    return { ...base, content: markupText };
  });
}

// A literal `</script` inside embedded JSON text would end the containing
// <script> element regardless of the script's `type` — neutralize it before
// embedding, independent of JSON.stringify's own (unrelated) escaping.
function escapeForInlineScript(jsonText) {
  return jsonText.replace(/<\/script/gi, '<\\/script');
}

function seed({ manifestPath, mode, outPath }) {
  if (mode !== 'live' && mode !== 'durable') {
    throw new SeedError(`--mode must be "live" or "durable", got ${JSON.stringify(mode)}`);
  }
  const manifestDir = path.dirname(path.resolve(manifestPath));
  const manifest = readManifest(manifestPath);
  validateManifest(manifest, mode, manifestDir);

  const variants = buildVariantData(manifest, mode, manifestDir, path.dirname(path.resolve(outPath)));
  const data = {
    mode,
    scope: manifest.scope,
    seedKey: manifest.seedKey,
    variants,
  };
  if (mode === 'durable') {
    data.outcome = {
      winner: manifest.outcome.winner,
      date: manifest.outcome.date || new Date(0).toISOString(),
      seedKey: manifest.seedKey,
      rerollCount: manifest.rerollCount || 0,
      steerHistory: manifest.steerHistory || [],
      tweaks: manifest.tweaks || [],
    };
  }

  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const dataJson = escapeForInlineScript(JSON.stringify(data));
  const output = template
    .replace('__VARIANT_DATA__', () => dataJson)
    .replace('__MODE__', mode);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, output);

  const bytes = Buffer.byteLength(output);
  if (bytes > SIZE_WARNING_BYTES) {
    process.stderr.write(
      `seed-compare: warning — ${outPath} is ${bytes} bytes, over the ${SIZE_WARNING_BYTES}-byte size guideline\n`,
    );
  }
  return { outPath, bytes };
}

function main(argv) {
  const opts = parseArgs(argv);
  if (!opts.manifest || !opts.mode || !opts.out) {
    throw new SeedError('usage: seed-compare.mjs --manifest <path> --mode live|durable --out <path>');
  }
  const result = seed({ manifestPath: opts.manifest, mode: opts.mode, outPath: opts.out });
  process.stdout.write(`wrote ${result.outPath} (${result.bytes} bytes)\n`);
}

const isMain = process.argv[1] && url.pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`seed-compare: ${err.message}\n`);
    process.exitCode = 1;
  }
}

export { seed, validateManifest, assembleIdentityDoc, escapeForInlineScript, SeedError };
