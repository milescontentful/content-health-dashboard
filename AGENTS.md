# Agent Guide — content-health-dashboard

## What This App Does
Forked from Contentful's `content-insights` app. Provides a dashboard for content production metrics AND content quality signals (localization coverage, SEO/a11y, asset health, AI audit, taxonomy coverage).

Surfaces metrics in:
- **Home** (`LOCATION_HOME`) — compact health score widget
- **Page** (`LOCATION_PAGE`) — full tabbed dashboard
- **App Configuration** (`LOCATION_APP_CONFIG`) — installation parameters

## Archetype
Standard Vite + React + TypeScript app built with `create-contentful-app`.

## Locations

| Location | File | Purpose |
|----------|------|---------|
| `LOCATION_APP_CONFIG` | `src/locations/ConfigScreen.tsx` | Install/config: time windows, content type filters, future AI Action IDs |
| `LOCATION_PAGE` | `src/locations/Page.tsx` | Full-page dashboard with tabbed modules |
| `LOCATION_HOME` | `src/locations/Home.tsx` | Compact health-score widget |

## Key Dependencies

| Package | Role |
|---------|------|
| `@contentful/app-sdk` | App Framework SDK (locations, dialog, entry handles) |
| `@contentful/react-apps-toolkit` | `useSDK`, `useCMA`, `useAutoResizer` |
| `@contentful/f36-components` + tokens | Forma 36 UI — required for all UI |
| `contentful-management` | CMA client for entries, content types, releases |
| `@tanstack/react-query` | Caching layer for CMA reads |
| `recharts` | Charts |
| `dayjs` | Date math |

## Source Layout

```
src/
├── App.tsx                  # Location router
├── index.tsx                # Entry point + react-query provider
├── locations/               # ConfigScreen, Home, Page
├── components/              # MetricCard, ChartWrapper, *Table, Dashboard
├── hooks/                   # useAllEntries, useReleases, useScheduledActions, ...
├── metrics/                 # MetricsCalculator.ts (aggregation logic)
├── utils/                   # types, dateUtils, EntryUtils, Validator, consts
└── scripts/                 # generateEntries / deleteEntries (demo seed)
test/                        # Vitest tests, hook tests, mocks
```

## Architecture Invariants

- **Data fetching pattern**: every CMA read goes through a hook in `src/hooks/`. Hooks wrap `contentful-management` calls in TanStack Query. Components should never call the CMA directly.
- **Metric aggregation lives in `src/metrics/MetricsCalculator.ts`** — new metrics should add functions here, not embed math in components.
- **Type definitions live in `src/utils/types.ts`** — extend there for new modules.
- **Home location must stay lightweight** — it renders on every Contentful home visit. Defer heavy queries to Page.
- **All UI uses Forma 36** — no raw `<div>` styling; use F36 tokens and components.
- **Installation parameters** drive configuration. Persist user choices via `sdk.app.setParameters()` from ConfigScreen.

## Extension Modules (planned)

Each new module follows the same shape:

```
src/
├── hooks/use<Module>.ts            # CMA fetch + react-query
├── metrics/<Module>Calculator.ts   # Pure aggregation/scoring
├── components/<Module>Tab.tsx      # Forma 36 UI
└── utils/types.ts                  # Shared types extended
```

Roadmap order:
1. **LocalizationCoverage** — entries × locales matrix, uses `sdk.locales` + entry field presence checks
2. **AssetHealth** — orphan detection (no `links_to_asset`), size/format/alt-text analysis
3. **SeoA11yAudit** — heading order, meta presence, alt-text completeness, readability
4. **AiContentAudit** — calls a configured AI Action across N entries, aggregates flags
5. **TaxonomyCoverage** — `sys.metadata.concepts` coverage per content type
6. **ReferenceRisk** — `links_to_entry` blast radius per entry

## Never / Always

- **Never** hardcode app definition IDs or org IDs — these are env vars / installation parameters.
- **Never** call the CMA directly from a component — always go through a `hooks/use*.ts`.
- **Never** introduce a new dependency without checking `package.json` first; reuse Forma 36, react-query, recharts, dayjs.
- **Always** handle empty states with the F36 `Note` component.
- **Always** disable interactive controls during save / mutation.
- **Always** call `sdk.app.setReady()` after async init on the Config Screen.

## Provenance

Forked from `contentful/apps/apps/content-insights` (Apache 2.0). The Contentful-internal `deploy` script with hardcoded app definition ID has been removed; use `npm run create-app-definition` + `npm run upload` instead.
