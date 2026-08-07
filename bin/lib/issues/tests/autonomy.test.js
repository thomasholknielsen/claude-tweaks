'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { CEILINGS, resolveCeiling, permittedGrants } = require('../autonomy.js');

const cleanRow = { verdict: 'clean', kind: 'producer', dispositioned: 9, coverage: 0.9 };

test('ceilings are ordered least to most permissive', () => {
  assert.deepEqual(CEILINGS, ['supervised', 'trusted', 'unattended']);
});

test('resolution follows CLI > run config > policy > default', () => {
  assert.equal(resolveCeiling({ cliArg: 'unattended', runConfig: 'trusted', policy: 'supervised' }), 'unattended');
  assert.equal(resolveCeiling({ runConfig: 'trusted', policy: 'supervised' }), 'trusted');
  assert.equal(resolveCeiling({ policy: 'trusted' }), 'trusted');
  assert.equal(resolveCeiling({}), 'supervised');
  assert.equal(resolveCeiling(undefined), 'supervised');
});

test('an unrecognized value is ignored, and resolution continues past it', () => {
  // Fail toward less autonomy, never toward more: a typo in policy.yml must not
  // silently resolve to a tier the operator did not name, in either direction.
  assert.equal(resolveCeiling({ cliArg: 'yolo', policy: 'trusted' }), 'trusted');
  assert.equal(resolveCeiling({ cliArg: 'TRUSTED' }), 'supervised', 'case-sensitive by design');
  assert.equal(resolveCeiling({ policy: '' }), 'supervised');
});

test('supervised permits nothing, whatever the evidence says', () => {
  const result = permittedGrants({ ceiling: 'supervised', row: cleanRow });
  assert.equal(result.bornReady, false);
  assert.equal(result.bornAuthorized, false);
  assert.ok(result.reason.length > 0);
});

test('trusted permits born-ready on a clean class, never born-authorized', () => {
  const result = permittedGrants({ ceiling: 'trusted', row: cleanRow });
  assert.equal(result.bornReady, true);
  assert.equal(result.bornAuthorized, false);
});

test('a mixed or ungraded class earns nothing at any ceiling', () => {
  for (const ceiling of CEILINGS) {
    for (const verdict of ['mixed', 'insufficient-evidence']) {
      const result = permittedGrants({ ceiling, row: { ...cleanRow, verdict } });
      assert.equal(result.bornReady, false, `${ceiling}/${verdict}`);
      assert.equal(result.bornAuthorized, false, `${ceiling}/${verdict}`);
    }
  }
});

test('the unstructured kind is denied at every ceiling, clean verdict or not', () => {
  // Defense in depth. trust.js pins this kind's verdict already; this module must
  // deny it on its own, so a future change to either one cannot open it alone.
  for (const ceiling of CEILINGS) {
    const result = permittedGrants({ ceiling, row: { ...cleanRow, kind: 'unstructured' } });
    assert.equal(result.bornReady, false, ceiling);
    assert.equal(result.bornAuthorized, false, ceiling);
    assert.match(result.reason, /unclassifi/i);
  }
});

test('a kind this module does not recognize is denied, not permitted', () => {
  // The check is an allowlist of the three kinds that name a real class, not a
  // denylist naming 'unstructured'. A denylist inverts the design's stated hazard
  // instead of fixing it: a fifth kind added to provenance.js later, or a row
  // whose kind is an empty string, would sail through it with a clean verdict.
  // Both of these granted before the allowlist landed.
  for (const kind of ['some-future-kind', '', 'PRODUCER', undefined, null, 42]) {
    const result = permittedGrants({ ceiling: 'trusted', row: { ...cleanRow, kind } });
    assert.equal(result.bornReady, false, `kind ${JSON.stringify(kind)} must not grade`);
    assert.equal(result.bornAuthorized, false, `kind ${JSON.stringify(kind)} must not grade`);
  }
});

test('a human-filed class earns nothing, however clean and however high the ceiling', () => {
  // Born-ready authorizes an AGENT's filing to skip /claude-tweaks:specify. A
  // human-filed class has no agent filing to authorize, so its verdict — however
  // good — is evidence about the wrong thing. This is not hypothetical: on this
  // repo `human:human` is the largest provenance by a wide margin and the first
  // that will clear both floors, so a governor that graded it would fire here
  // first and on the weakest possible justification.
  const humanRow = { ...cleanRow, kind: 'human', provenance: 'human:human' };
  for (const ceiling of ['trusted', 'unattended']) {
    for (const optIn of [undefined, true]) {
      const result = permittedGrants({ ceiling, row: humanRow, grantOriginationEnabled: optIn });
      assert.equal(result.bornReady, false, `${ceiling}/${optIn}`);
      assert.equal(result.bornAuthorized, false, `${ceiling}/${optIn}`);
      assert.match(result.reason, /human-filed/);
    }
  }
});

test('agent-filed classes are exactly producer and side-effect', () => {
  // Control for the test above — the exclusion must not be so wide that it also
  // denies the two kinds the tier exists to serve.
  for (const kind of ['producer', 'side-effect']) {
    assert.equal(permittedGrants({ ceiling: 'trusted', row: { ...cleanRow, kind } }).bornReady, true, kind);
  }
});

test('every kind provenance.js emits is classified, and denials are distinguishable', () => {
  // Control for the allowlist: it must not be so tight that it denies a real
  // class, and the two reasons for denying must not blur together. These four
  // are provenance.js's complete output set, and they fall into three buckets —
  // grantable, gradable-but-human-filed, and structurally unclassifiable — so a
  // change there this module has not been taught about fails here, not in
  // production.
  assert.equal(permittedGrants({ ceiling: 'trusted', row: { ...cleanRow, kind: 'producer' } }).bornReady, true);
  assert.equal(permittedGrants({ ceiling: 'trusted', row: { ...cleanRow, kind: 'side-effect' } }).bornReady, true);

  const human = permittedGrants({ ceiling: 'trusted', row: { ...cleanRow, kind: 'human' } });
  assert.equal(human.bornReady, false);
  assert.match(human.reason, /human-filed/, 'a real class denied for whose filing it is');

  const unstructured = permittedGrants({ ceiling: 'trusted', row: { ...cleanRow, kind: 'unstructured' } });
  assert.equal(unstructured.bornReady, false);
  assert.match(unstructured.reason, /unclassifiable/, 'not a class at all — a different denial');
});

test('a missing or malformed row is denied, not defaulted', () => {
  for (const row of [undefined, null, {}, { verdict: 'clean' }, { kind: 'human' }]) {
    const result = permittedGrants({ ceiling: 'unattended', row });
    assert.equal(result.bornReady, false);
    assert.equal(result.bornAuthorized, false);
  }
});

test('unattended permits born-authorized only on an explicit second opt-in', () => {
  // Machinery originating a grant contradicts _shared/work-record.md's standing
  // invariant ("auto:* labels are only ever added by an interactive human
  // session"). The tier is defined so the ceiling is complete, but the grant path
  // stays shut behind its own flag until that invariant is deliberately amended.
  const withoutOptIn = permittedGrants({ ceiling: 'unattended', row: cleanRow });
  assert.equal(withoutOptIn.bornReady, true);
  assert.equal(withoutOptIn.bornAuthorized, false);
  assert.match(withoutOptIn.reason, /opt-in/i);

  const withOptIn = permittedGrants({ ceiling: 'unattended', row: cleanRow, grantOriginationEnabled: true });
  assert.equal(withOptIn.bornAuthorized, true);
});

test('the opt-in is the literal boolean true, and nothing merely truthy', () => {
  // This is the whole of the safety predicate: `grantOriginationEnabled !== true`
  // is what stands between a config value and machinery originating auto:build.
  // Without this test the check can be relaxed to `!grantOriginationEnabled` and
  // the suite stays green — verified by hand-reverting it, which is the only way
  // to know a check discriminates. A caller reading 'true' or 1 out of parsed YAML
  // must not clear this gate by accident.
  for (const value of ['true', 1, {}, [], 'yes', 'on', -1]) {
    const result = permittedGrants({ ceiling: 'unattended', row: cleanRow, grantOriginationEnabled: value });
    assert.equal(result.bornAuthorized, false, `${JSON.stringify(value)} must not clear the opt-in`);
  }
});

test('permittedGrants validates its own ceiling rather than relying on indexOf', () => {
  // Denying an unrecognized ceiling must be deliberate, not a side effect of
  // CEILINGS.indexOf(garbage) being -1. Reverting isCeiling to `ceiling || ...`
  // also leaves the suite green without this.
  for (const ceiling of ['yolo', 'UNATTENDED', ' unattended ', 42, null, ['unattended']]) {
    const result = permittedGrants({ ceiling, row: cleanRow, grantOriginationEnabled: true });
    assert.equal(result.bornReady, false, `ceiling ${JSON.stringify(ceiling)} must fall back to supervised`);
    assert.equal(result.bornAuthorized, false, `ceiling ${JSON.stringify(ceiling)} must fall back to supervised`);
  }
});

test('permittedGrants survives a null argument the way resolveCeiling does', () => {
  // Default parameters fire only on undefined, so `= {}` left null throwing while
  // the sibling function returned a value. Two functions in one module should not
  // disagree about robustness — a caller sweeping records would crash mid-run.
  assert.equal(permittedGrants(null).bornReady, false);
  assert.equal(permittedGrants(undefined).bornReady, false);
  assert.equal(permittedGrants().bornReady, false);
});

test('the second opt-in cannot raise a lower ceiling', () => {
  for (const ceiling of ['supervised', 'trusted']) {
    const result = permittedGrants({ ceiling, row: cleanRow, grantOriginationEnabled: true });
    assert.equal(result.bornAuthorized, false, ceiling);
  }
});
