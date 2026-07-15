import { describe, it, expect } from 'vitest';
import {
  computeAssetRows,
  scanEntries,
  DEFAULT_ALT_TEXT_SOURCES,
} from '../../src/modules/asset-health/assetHealthLogic';

const LOCALE = 'en-US';

const assetLink = (id: string) => ({ sys: { type: 'Link', linkType: 'Asset', id } });

const makeAsset = (id: string, opts: { description?: string; size?: number } = {}) => ({
  sys: { id },
  fields: {
    title: { [LOCALE]: `Asset ${id}` },
    file: { [LOCALE]: { url: `//images.ctfassets.net/${id}.jpg`, contentType: 'image/jpeg', details: { size: opts.size ?? 1000 } } },
    ...(opts.description ? { description: { [LOCALE]: opts.description } } : {}),
  },
});

const makeEntry = (id: string, contentType: string, fields: Record<string, any>) => ({
  sys: { id, contentType: { sys: { id: contentType } } },
  fields,
});

describe('computeAssetRows', () => {
  it('uses native asset description by default', () => {
    const assets = [makeAsset('a1', { description: 'alt here' }), makeAsset('a2')];
    const rows = computeAssetRows(assets, [], LOCALE, DEFAULT_ALT_TEXT_SOURCES);
    expect(rows.find((r) => r.id === 'a1')?.hasAltText).toBe(true);
    expect(rows.find((r) => r.id === 'a2')?.hasAltText).toBe(false);
  });

  it('falls back to default sources when given an empty list', () => {
    const rows = computeAssetRows([makeAsset('a1', { description: 'x' })], [], LOCALE, []);
    expect(rows[0].hasAltText).toBe(true);
  });

  it('detects alt text from a wrapper content type field', () => {
    const assets = [makeAsset('a1'), makeAsset('a2')];
    const entries = [
      makeEntry('e1', 'assetWrapper', {
        caption: { [LOCALE]: 'a caption' },
        image: { [LOCALE]: assetLink('a1') },
      }),
      // Wrapper without caption — its asset stays uncovered
      makeEntry('e2', 'assetWrapper', {
        image: { [LOCALE]: assetLink('a2') },
      }),
    ];
    const rows = computeAssetRows(assets, entries, LOCALE, [
      { contentType: 'assetWrapper', field: 'caption' },
    ]);
    expect(rows.find((r) => r.id === 'a1')?.hasAltText).toBe(true);
    expect(rows.find((r) => r.id === 'a2')?.hasAltText).toBe(false);
  });

  it('covers every asset linked from a multi-asset wrapper entry', () => {
    const assets = [makeAsset('a1'), makeAsset('a2')];
    const entries = [
      makeEntry('e1', 'gallery', {
        caption: { [LOCALE]: 'gallery caption' },
        images: { [LOCALE]: [assetLink('a1'), assetLink('a2')] },
      }),
    ];
    const rows = computeAssetRows(assets, entries, LOCALE, [
      { contentType: 'gallery', field: 'caption' },
    ]);
    expect(rows.every((r) => r.hasAltText)).toBe(true);
  });

  it('combines native and wrapper sources', () => {
    const assets = [makeAsset('a1', { description: 'native' }), makeAsset('a2')];
    const entries = [
      makeEntry('e1', 'assetWrapper', {
        caption: { [LOCALE]: 'wrapped' },
        image: { [LOCALE]: assetLink('a2') },
      }),
    ];
    const rows = computeAssetRows(assets, entries, LOCALE, [
      { contentType: '__asset__', field: 'description' },
      { contentType: 'assetWrapper', field: 'caption' },
    ]);
    expect(rows.every((r) => r.hasAltText)).toBe(true);
  });

  it('flags orphans: assets not linked from any entry', () => {
    const assets = [makeAsset('linked'), makeAsset('orphan')];
    const entries = [
      makeEntry('e1', 'page', { hero: { [LOCALE]: assetLink('linked') } }),
    ];
    const rows = computeAssetRows(assets, entries, LOCALE, DEFAULT_ALT_TEXT_SOURCES);
    expect(rows.find((r) => r.id === 'linked')?.isOrphan).toBe(false);
    expect(rows.find((r) => r.id === 'orphan')?.isOrphan).toBe(true);
  });

  it('ignores wrapper fields on non-configured content types', () => {
    const assets = [makeAsset('a1')];
    const entries = [
      makeEntry('e1', 'otherType', {
        caption: { [LOCALE]: 'not a wrapper' },
        image: { [LOCALE]: assetLink('a1') },
      }),
    ];
    const rows = computeAssetRows(assets, entries, LOCALE, [
      { contentType: 'assetWrapper', field: 'caption' },
    ]);
    expect(rows[0].hasAltText).toBe(false);
    expect(rows[0].isOrphan).toBe(false); // still counts as linked
  });
});

describe('scanEntries', () => {
  it('handles entries with missing fields gracefully', () => {
    const result = scanEntries([{ sys: { id: 'e1' } }], LOCALE, DEFAULT_ALT_TEXT_SOURCES);
    expect(result.linkedAssetIds.size).toBe(0);
    expect(result.assetsWithWrapperAlt.size).toBe(0);
  });

  it('does not treat entry links as asset links', () => {
    const entries = [
      makeEntry('e1', 'page', {
        related: { [LOCALE]: { sys: { type: 'Link', linkType: 'Entry', id: 'e2' } } },
      }),
    ];
    const result = scanEntries(entries, LOCALE, DEFAULT_ALT_TEXT_SOURCES);
    expect(result.linkedAssetIds.size).toBe(0);
  });
});
