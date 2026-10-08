import { asset } from './paths.js';

let manifestPromise = null;
const unitCache = new Map();

export function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(asset('data/manifest.json'), { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`manifest.json (HTTP ${r.status})`);
        return r.json();
      })
      .then((m) => {
        m.byId = Object.fromEntries(m.problems.map((p) => [p.id, p]));
        m.unitById = Object.fromEntries(m.units.map((u) => [u.id, u]));
        return m;
      });
    manifestPromise.catch(() => {
      manifestPromise = null;
    });
  }
  return manifestPromise;
}

const decodeB64 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

export function loadUnit(manifest, unitId) {
  const unit = manifest.unitById[unitId];
  if (!unit) return Promise.reject(new Error(`없는 단원: ${unitId}`));
  if (!unitCache.has(unit.file)) {
    const p = fetch(asset('data/' + unit.file))
      .then((r) => {
        if (!r.ok) throw new Error(`${unit.file} (HTTP ${r.status})`);
        return r.json();
      })
      .then((data) => {
        for (const prob of data.problems) {
          prob.tests = prob.tests.map((t) => (t.public ? t : { public: false, ...JSON.parse(decodeB64(t.enc)) }));
          const enc = prob.solution;
          prob.solutionCode = () => decodeB64(enc);
          delete prob.solution;
        }
        return data;
      });
    p.catch(() => unitCache.delete(unit.file));
    unitCache.set(unit.file, p);
  }
  return unitCache.get(unit.file);
}
