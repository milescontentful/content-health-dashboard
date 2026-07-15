import { describe, it, expect } from 'vitest';
import { computeSpaceHealth, buildDimensions, gradeFor } from '../../src/lib/healthScore';
import type { AssetRow } from '../../src/modules/asset-health/assetHealthLogic';

const NOW = new Date('2026-07-01T00:00:00Z');
const LOCALE = 'en-US';

const asset = (over: Partial<AssetRow> = {}): AssetRow => ({
  id: 'a', title: 'a', url: '', contentType: 'image/jpeg', size: 100,
  hasAltText: true, isOrphan: false, ...over,
});

const entry = (over: any = {}) => ({
  sys: { id: 'e', updatedAt: '2026-06-01T00:00:00Z', contentType: { sys: { id: 'page' } }, ...(over.sys ?? {}) },
  fields: over.fields ?? { title: { [LOCALE]: 'Hello' } },
  metadata: over.metadata,
});

describe('gradeFor', () => {
  it('maps score bands to letter grades', () => {
    expect(gradeFor(95)).toBe('A');
    expect(gradeFor(85)).toBe('B');
    expect(gradeFor(75)).toBe('C');
    expect(gradeFor(65)).toBe('D');
    expect(gradeFor(30)).toBe('F');
  });
});

describe('computeSpaceHealth', () => {
  it('returns null overall with no dimensions', () => {
    const h = computeSpaceHealth([]);
    expect(h.overall).toBeNull();
    expect(h.grade).toBeNull();
  });

  it('renormalizes weights over present dimensions', () => {
    const h = computeSpaceHealth([
      { id: 'a', label: 'A', score: 100, weight: 25, detail: '' },
      { id: 'b', label: 'B', score: 50, weight: 25, detail: '' },
    ]);
    expect(h.overall).toBe(75); // equal weights → simple average
  });

  it('weights unequal dimensions correctly', () => {
    const h = computeSpaceHealth([
      { id: 'a', label: 'A', score: 100, weight: 30, detail: '' },
      { id: 'b', label: 'B', score: 0, weight: 10, detail: '' },
    ]);
    expect(h.overall).toBe(75); // 100*(30/40) + 0*(10/40)
  });
});

describe('buildDimensions', () => {
  const base = {
    assetRows: [] as AssetRow[],
    entries: [] as any[],
    locales: [LOCALE],
    defaultLocale: LOCALE,
    now: NOW,
  };

  it('empty space produces no dimensions', () => {
    expect(buildDimensions(base)).toEqual([]);
  });

  it('scores asset health from alt text and orphans', () => {
    const dims = buildDimensions({
      ...base,
      assetRows: [asset(), asset({ hasAltText: false }), asset({ isOrphan: true }), asset()],
    });
    const d = dims.find((x) => x.id === 'assets')!;
    // altScore = 75, orphanScore = 75 → 75
    expect(d.score).toBe(75);
    expect(d.detail).toContain('1 missing alt text');
  });

  it('scores freshness against the stale cutoff', () => {
    const dims = buildDimensions({
      ...base,
      entries: [
        entry(), // fresh (June 2026)
        entry({ sys: { updatedAt: '2025-01-01T00:00:00Z' } }), // stale
      ],
      staleCutoffMonths: 6,
    });
    const d = dims.find((x) => x.id === 'freshness')!;
    expect(d.score).toBe(50);
  });

  it('scores reference integrity from the sample', () => {
    const dims = buildDimensions({ ...base, brokenRefs: { broken: 1, sampledLinks: 20 } });
    const d = dims.find((x) => x.id === 'references')!;
    expect(d.score).toBe(95);
  });

  it('omits references dimension when no links were sampled', () => {
    const dims = buildDimensions({ ...base, brokenRefs: { broken: 0, sampledLinks: 0 } });
    expect(dims.find((x) => x.id === 'references')).toBeUndefined();
  });

  it('skips localization for single-locale spaces', () => {
    const dims = buildDimensions({ ...base, entries: [entry()] });
    expect(dims.find((x) => x.id === 'localization')).toBeUndefined();
  });

  it('averages per-entry locale coverage for multi-locale spaces', () => {
    const dims = buildDimensions({
      ...base,
      locales: [LOCALE, 'de-DE'],
      entries: [
        entry({ fields: { title: { [LOCALE]: 'Hi', 'de-DE': 'Hallo' } } }), // 100%
        entry(), // 50%
      ],
    });
    const d = dims.find((x) => x.id === 'localization')!;
    expect(d.score).toBe(75);
  });

  it('includes taxonomy only when concepts are in use', () => {
    const noTax = buildDimensions({ ...base, entries: [entry()] });
    expect(noTax.find((x) => x.id === 'taxonomy')).toBeUndefined();

    const withTax = buildDimensions({
      ...base,
      entries: [entry({ metadata: { concepts: [{ sys: { id: 'c1' } }] } }), entry()],
    });
    const d = withTax.find((x) => x.id === 'taxonomy')!;
    expect(d.score).toBe(50);
  });

  it('scores SEO only for configured page types', () => {
    const dims = buildDimensions({
      ...base,
      entries: [entry()],
      seoPageContentTypes: ['page'],
      contentTypes: [{ sys: { id: 'page' }, fields: [{ id: 'title', name: 'Title' }] }],
    });
    const d = dims.find((x) => x.id === 'seo');
    expect(d).toBeDefined();
    expect(d!.score).toBeGreaterThanOrEqual(0);
    expect(d!.score).toBeLessThanOrEqual(100);
  });
});
