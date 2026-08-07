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

test('every kind provenance.js actually emits is classified, none silently denied', () => {
  // Control for the allowlist: it must not be so tight that it denies a real
  // class. These four are provenance.js's complete output set — three gradable,
  // one pinned — so a change there that this module has not been taught about
  // fails here rather than in production.
  const gradable = ['producer', 'side-effect', 'human'];
  for (const kind of gradable) {
    assert.equal(permittedGrants({ ceiling: 'trusted', row: { ...cleanRow, kind } }).bornReady, true, kind);
  }
  assert.equal(permittedGrants({ ceiling: 'trusted', row: { ...cleanRow, kind: 'unstructured' } }).bornReady, false);
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

test('the second opt-in cannot raise a lower ceiling', () => {
  for (const ceiling of ['supervised', 'trusted']) {
    const result = permittedGrants({ ceiling, row: cleanRow, grantOriginationEnabled: true });
    assert.equal(result.bornAuthorized, false, ceiling);
  }
});
