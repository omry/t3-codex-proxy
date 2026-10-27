// Matching ranges define support, including newer releases in open ranges.
// Exact-version test coverage is separate; input guards protect every rewrite.
export const FIX_SETS = [
  { id: 'legacy', range: { max: '0.1.3-nightly.20261025.3655' } },
  { id: 'current', range: { min: '0.1.3-nightly.20261025.3669' } },
];

export const TESTED_VERSIONS = [
  '0.1.3-nightly.20261025.3655',
  '0.1.3-nightly.20261025.3669',
  '0.1.3-nightly.20261027.3754',
  '0.1.3',
];

function parseVersion(value) {
  if (typeof value !== 'string' || value.length > 256) return null;
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value);
  if (!match) return null;
  const pre = match[4]?.split('.') ?? [];
  if (pre.some(part => /^\d+$/.test(part) && part.length > 1 && part[0] === '0')) return null;
  return { core: match.slice(1, 4).map(BigInt), pre };
}

const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function compare(a, b) {
  for (let i = 0; i < 3; i++) {
    const result = order(a.core[i], b.core[i]);
    if (result) return result;
  }
  if (!a.pre.length || !b.pre.length) return order(!a.pre.length, !b.pre.length);
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    if (i === a.pre.length) return -1;
    if (i === b.pre.length) return 1;
    const x = a.pre[i], y = b.pre[i];
    if (x === y) continue;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx !== ny) return nx ? -1 : 1;
    return nx ? order(BigInt(x), BigInt(y)) : order(x, y);
  }
  return 0;
}

export function matchesVersion(version, { min, max } = {}) {
  const lower = min === undefined ? null : parseVersion(min);
  const upper = max === undefined ? null : parseVersion(max);
  if ((min !== undefined && !lower) || (max !== undefined && !upper) ||
      (lower && upper && compare(lower, upper) > 0)) throw new Error('invalid_version_range');
  const value = parseVersion(version);
  return Boolean(value && (!lower || compare(value, lower) >= 0) && (!upper || compare(value, upper) <= 0));
}

export function selectCompatibility(version) {
  const matches = FIX_SETS.filter(fix => matchesVersion(version, fix.range));
  return { fixSet: matches.length === 1 ? matches[0].id : null, tested: TESTED_VERSIONS.includes(version) };
}
