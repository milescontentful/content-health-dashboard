import type { AssetRow } from '../modules/asset-health/assetHealthLogic';
import { scoreSEO, scoreAEO, scoreGEO } from '../modules/seo-aeo-geo/scorer';

// Space Health Score — pure computation, no React, no SDK.
//
// This is deliberately a standalone function over plain data so a future
// organization-location view can run it once per space and roll the results
// up across 100 spaces without touching any UI code.

export interface HealthDimension {
  id: string;
  label: string;
  /** 0–100 */
  score: number;
  /** Relative weight; renormalized over the dimensions actually present. */
  weight: number;
  /** One-line human explanation of what drove the score. */
  detail: string;
  /** Dashboard module tab this dimension drills into. */
  moduleId?: string;
}

export interface SpaceHealth {
  /** 0–100 weighted composite, or null when no dimension could be computed. */
  overall: number | null;
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | null;
  dimensions: HealthDimension[];
}

export function gradeFor(score: number): SpaceHealth['grade'] {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export function computeSpaceHealth(dimensions: HealthDimension[]): SpaceHealth {
  const present = dimensions.filter((d) => Number.isFinite(d.score));
  if (present.length === 0) return { overall: null, grade: null, dimensions: [] };

  const totalWeight = present.reduce((s, d) => s + d.weight, 0);
  const overall = Math.round(
    present.reduce((s, d) => s + d.score * (d.weight / totalWeight), 0),
  );
  return { overall, grade: gradeFor(overall), dimensions: present };
}

// ── Dimension builders ────────────────────────────────────────────────────────
// All inputs come from data the dashboard already fetches — building the
// dimensions costs zero extra API calls.

export interface HealthInputs {
  assetRows: AssetRow[];
  /** Raw CMA entries (fields keyed by locale, sys, metadata). A sample is fine. */
  entries: any[];
  locales: string[];
  defaultLocale: string;
  /** { broken, sampledLinks } from the lightweight broken-reference sample. */
  brokenRefs?: { broken: number; sampledLinks: number };
  /** Content types (with fields), needed only for the SEO dimension. */
  contentTypes?: Array<{ sys: { id: string }; fields: Array<{ id: string; name: string }> }>;
  /** Content type IDs to score for SEO readiness (install param). */
  seoPageContentTypes?: string[];
  /** Entries not updated in this many months count as stale. */
  staleCutoffMonths?: number;
  now?: Date;
}

export function buildDimensions(input: HealthInputs): HealthDimension[] {
  const dims: HealthDimension[] = [];
  const {
    assetRows, entries, locales, defaultLocale,
    brokenRefs, contentTypes, seoPageContentTypes,
    staleCutoffMonths = 6,
    now = new Date(),
  } = input;

  // Reference integrity — from the broken-link sample
  if (brokenRefs && brokenRefs.sampledLinks > 0) {
    const score = Math.round(100 * (1 - brokenRefs.broken / brokenRefs.sampledLinks));
    dims.push({
      id: 'references', label: 'Reference integrity', score, weight: 25,
      moduleId: 'reference-risk',
      detail: brokenRefs.broken === 0
        ? `No broken links in ${brokenRefs.sampledLinks} sampled references`
        : `${brokenRefs.broken} broken of ${brokenRefs.sampledLinks} sampled references`,
    });
  }

  // Asset health — alt text coverage + orphan rate
  if (assetRows.length > 0) {
    const missingAlt = assetRows.filter((a) => !a.hasAltText).length;
    const orphans = assetRows.filter((a) => a.isOrphan).length;
    const altScore = 100 * (1 - missingAlt / assetRows.length);
    const orphanScore = 100 * (1 - orphans / assetRows.length);
    dims.push({
      id: 'assets', label: 'Asset health', score: Math.round(altScore * 0.6 + orphanScore * 0.4),
      weight: 20, moduleId: 'asset-health',
      detail: `${missingAlt} missing alt text · ${orphans} orphaned of ${assetRows.length} assets`,
    });
  }

  // Freshness — share of entries updated within the cutoff
  if (entries.length > 0) {
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - staleCutoffMonths);
    const stale = entries.filter((e) => new Date(e.sys?.updatedAt ?? 0) < cutoff).length;
    dims.push({
      id: 'freshness', label: 'Content freshness',
      score: Math.round(100 * (1 - stale / entries.length)),
      weight: 20, moduleId: 'production-metrics',
      detail: `${stale} of ${entries.length} entries untouched for ${staleCutoffMonths}+ months`,
    });
  }

  // Localization — average per-entry locale coverage (multi-locale spaces only)
  if (locales.length > 1 && entries.length > 0) {
    let coverageSum = 0;
    for (const entry of entries) {
      const present = new Set<string>();
      for (const fieldVal of Object.values(entry.fields ?? {}) as any[]) {
        if (fieldVal && typeof fieldVal === 'object') {
          for (const code of Object.keys(fieldVal)) {
            if (locales.includes(code)) present.add(code);
          }
        }
      }
      coverageSum += present.size / locales.length;
    }
    const avg = coverageSum / entries.length;
    dims.push({
      id: 'localization', label: 'Localization coverage',
      score: Math.round(100 * avg),
      weight: 15, moduleId: 'localization-coverage',
      detail: `Avg ${Math.round(100 * avg)}% of ${locales.length} locales per entry`,
    });
  }

  // SEO readiness — heuristic scorers over configured page types (sample)
  if (seoPageContentTypes?.length && contentTypes?.length) {
    const pageEntries = entries.filter((e) =>
      seoPageContentTypes.includes(e.sys?.contentType?.sys?.id),
    );
    if (pageEntries.length > 0) {
      const fieldNamesByCt = new Map<string, Record<string, string>>();
      for (const ct of contentTypes) {
        const names: Record<string, string> = {};
        for (const f of ct.fields) {
          names[f.name.toLowerCase().replace(/\s+/g, '')] = f.id;
          names[f.id.toLowerCase()] = f.id;
        }
        fieldNamesByCt.set(ct.sys.id, names);
      }
      let sum = 0;
      for (const e of pageEntries) {
        const names = fieldNamesByCt.get(e.sys.contentType.sys.id) ?? {};
        const seo = scoreSEO(e.fields, defaultLocale, names).score;
        const aeo = scoreAEO(e.fields, defaultLocale, names).score;
        const geo = scoreGEO(e.fields, defaultLocale, names).score;
        sum += (seo + aeo + geo) / 3;
      }
      dims.push({
        id: 'seo', label: 'SEO / GEO readiness',
        score: Math.round(sum / pageEntries.length),
        weight: 10, moduleId: 'seo-aeo-geo',
        detail: `Avg composite across ${pageEntries.length} page entries`,
      });
    }
  }

  // Taxonomy — only when the space actually uses concepts (an unused feature
  // shouldn't drag the composite to F)
  if (entries.length > 0) {
    const tagged = entries.filter((e) => (e.metadata?.concepts?.length ?? 0) > 0).length;
    if (tagged > 0) {
      dims.push({
        id: 'taxonomy', label: 'Taxonomy coverage',
        score: Math.round(100 * (tagged / entries.length)),
        weight: 10, moduleId: 'taxonomy-coverage',
        detail: `${tagged} of ${entries.length} entries carry taxonomy concepts`,
      });
    }
  }

  return dims;
}
