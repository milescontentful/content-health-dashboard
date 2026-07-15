import type { AltTextSource } from '../types';

// Pure asset-health computation — no React, no SDK. Shared by the Asset Health
// module, its Home widget, and the Home health summary bar, and reusable by a
// future org-level rollup (compute per space, aggregate).

export interface AssetRow {
  id: string;
  title: string;
  url: string;
  contentType: string;
  size: number;
  hasAltText: boolean;
  isOrphan: boolean;
}

// Default: check the native asset description field
export const DEFAULT_ALT_TEXT_SOURCES: AltTextSource[] = [
  { contentType: '__asset__', field: 'description' },
];

// CMA returns asset links as { sys: { type: 'Link', linkType: 'Asset', id } }
const isAssetLink = (v: any): boolean => v?.sys?.type === 'Link' && v?.sys?.linkType === 'Asset';

function collectAssetLinks(fieldValue: any, into: Set<string>) {
  if (isAssetLink(fieldValue)) into.add(fieldValue.sys.id);
  if (Array.isArray(fieldValue)) {
    for (const item of fieldValue) {
      if (isAssetLink(item)) into.add(item.sys.id);
    }
  }
}

/**
 * Scan entries once to find (a) every linked asset (orphan detection) and
 * (b) assets whose alt text lives on a wrapper entry (e.g. assetWrapper.caption).
 */
export function scanEntries(
  entries: any[],
  defaultLocale: string,
  altTextSources: AltTextSource[],
): { linkedAssetIds: Set<string>; assetsWithWrapperAlt: Set<string> } {
  const wrapperSources = altTextSources.filter((s) => s.contentType !== '__asset__');
  const wrapperCTs = new Set(wrapperSources.map((s) => s.contentType));

  const linkedAssetIds = new Set<string>();
  const assetsWithWrapperAlt = new Set<string>();

  for (const entry of entries) {
    const ctId: string = entry.sys?.contentType?.sys?.id ?? '';

    // Does this wrapper entry carry alt text? Checked once per entry.
    const hasWrapperAlt =
      wrapperCTs.has(ctId) &&
      wrapperSources.some(
        (s) => s.contentType === ctId && !!entry.fields?.[s.field]?.[defaultLocale],
      );

    // Single pass over fields: every asset link counts for orphan detection;
    // links from an alt-carrying wrapper entry also count as "has alt text".
    for (const fieldVal of Object.values(entry.fields ?? {}) as any[]) {
      const v = fieldVal?.[defaultLocale];
      collectAssetLinks(v, linkedAssetIds);
      if (hasWrapperAlt) collectAssetLinks(v, assetsWithWrapperAlt);
    }
  }

  return { linkedAssetIds, assetsWithWrapperAlt };
}

/** Build per-asset health rows from raw CMA assets + entries. Pure. */
export function computeAssetRows(
  assets: any[],
  entries: any[],
  defaultLocale: string,
  altTextSources: AltTextSource[],
): AssetRow[] {
  const sources = altTextSources.length > 0 ? altTextSources : DEFAULT_ALT_TEXT_SOURCES;
  const nativeSources = sources.filter((s) => s.contentType === '__asset__');
  const { linkedAssetIds, assetsWithWrapperAlt } = scanEntries(entries, defaultLocale, sources);

  return assets.map((asset: any) => {
    const fileField = asset.fields?.file?.[defaultLocale];
    const titleField = asset.fields?.title?.[defaultLocale];

    const hasNativeAlt = nativeSources.some((s) => !!asset.fields?.[s.field]?.[defaultLocale]);

    return {
      id: asset.sys.id,
      title: titleField ?? asset.sys.id,
      url: fileField?.url ? `https:${fileField.url}` : '',
      contentType: fileField?.contentType ?? 'unknown',
      size: fileField?.details?.size ?? 0,
      hasAltText: hasNativeAlt || assetsWithWrapperAlt.has(asset.sys.id),
      isOrphan: !linkedAssetIds.has(asset.sys.id),
    };
  });
}

export interface AssetScan {
  rows: AssetRow[];
  defaultLocale: string;
  totalAssets: number; // total in space (rows may be a truncated sample)
  totalEntries: number;
  scannedEntries: number;
}

/**
 * Shared fetch + compute used by the Asset Health module, Home widget, and
 * health summary bar — one React Query cache entry instead of three fetches.
 * ponytail: single 200-asset / 1000-entry calls for now; pagination lands in Phase 1.
 */
export async function fetchAssetScan(cma: any, altTextSources: AltTextSource[]): Promise<AssetScan> {
  const [assetsRes, localesRes, entriesRes] = await Promise.all([
    cma.asset.getMany({ query: { limit: 200 } }),
    cma.locale.getMany({}),
    cma.entry.getMany({ query: { limit: 1000 } }),
  ]);

  const defaultLocale: string = localesRes.items.find((l: any) => l.default)?.code ?? 'en-US';

  return {
    rows: computeAssetRows(assetsRes.items, entriesRes.items, defaultLocale, altTextSources),
    defaultLocale,
    totalAssets: assetsRes.total ?? assetsRes.items.length,
    totalEntries: entriesRes.total ?? entriesRes.items.length,
    scannedEntries: entriesRes.items.length,
  };
}
