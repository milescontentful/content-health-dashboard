# Agent Guide — content-health-dashboard

## What This App Does

A Contentful App Framework app providing a 11-module dashboard across three locations:

- **Home** (`LOCATION_HOME`) — draggable widget grid with health summary bar; auto-saves order via CMA
- **Page** (`LOCATION_PAGE`) — full tabbed dashboard driven by the module registry
- **App Configuration** (`LOCATION_APP_CONFIG`) — 7-section config screen

## Module Registry

All modules self-register via a side-effect import. The registry is the source of truth for tab order, enabled state, and widget components.

```
src/modules/
├── types.ts              DashboardModule, AppInstallationParameters, ThemeConfig, etc.
├── registry.ts           registerModule(), getEnabledModules(), getModuleConfigs()
├── index.ts              Imports all modules — add new ones here
├── StudioThemeProvider.tsx  CSS-variable theming over Forma 36
├── production-metrics/   Publishing velocity, time-to-publish, stale content
├── localization-coverage/ Entries × locales heatmap
├── search-builder/       AND/OR/NOT visual query builder
├── seo-aeo-geo/          SEO + AEO + GEO scorecards per entry
├── asset-health/         Orphans, missing alt, oversized, format breakdown
├── taxonomy-coverage/    nt_concept coverage % per content type
├── custom-content/       Free-form cards authored in Config Screen
├── reference-risk/       Broken links, orphaned entries, blast-radius analysis
├── ai-audit/             Contentful AI Action integration (grade-content)
├── personalization/      Ninetailed CMA-native: experiences, audiences, coverage
└── analytics/            Publishing velocity + Contentful Analytics placeholder
```

## Architecture Invariants

1. **Module shape**: every module exports a React component (`ModuleProps`) and optionally a home widget (`HomeWidgetProps`). Both are registered via `registerModule()` in `index.ts`.
2. **No cross-module dependencies** — each module is self-contained.
3. **CMA access**: use `(sdk.cma as any).resource.method()` in module components. TanStack Query wraps all CMA reads. No direct fetch() calls.
4. **Forma 36 only** — no raw HTML, no Tailwind, no ad-hoc CSS. Use F36 tokens for spacing.
5. **TypeScript strict** — avoid `any` except for `sdk.cma` calls (the CMA types don't fully align with App SDK types in this version).
6. **Home location**: keep queries lightweight. The health summary bar uses a single batched CMA call. Module widgets should cap at 1–2 CMA calls.
7. **Navigation from Home → Page**: write moduleId to `sessionStorage` key `chd-nav-module`, then call `sdk.navigator.openCurrentAppPage()`. Page.tsx reads and clears this key on mount.
8. **Open content in new tab**: use `src/lib/openInNewTab.ts` — never use `sdk.navigator.openEntry({ slideIn: true })` from Page location.
9. **CSV export**: use `src/lib/csv.ts` — no external deps, BOM for Excel, `downloadCsv(filename, headers, rows)`.
10. **Auto-save from Home**: use `sdk.cma.appInstallation.upsert({ appDefinitionId: sdk.ids.app }, { parameters })` — this is the only way to persist params outside the Config Screen.

## Key Dependencies

| Package | Role |
|---|---|
| `@contentful/app-sdk` | App Framework SDK |
| `@contentful/react-apps-toolkit` | `useSDK()` hook |
| `@contentful/f36-components` + `f36-icons` + `f36-tokens` | Forma 36 UI |
| `contentful-management` | CMA client |
| `@tanstack/react-query` | CMA caching |
| `recharts` | Charts |
| `@dnd-kit/core` + `sortable` + `utilities` | Drag-and-drop (Config Screen + Home) |
| `lucide-react` | Additional icons beyond F36 |
| `dayjs` | Date math |
| `use-debounce` | Debouncing field inputs |

## Icon Names (F36)

Common icons available from `@contentful/f36-icons`:
- Download: `DownloadSimpleIcon`
- AI/OpenAI: `OpenAiLogoIcon`
- Drag: `DotsSixVerticalIcon`
- Delete: `TrashSimpleIcon`
- Add: `PlusIcon`
- Search: `MagnifyingGlassIcon`
- Warning: `WarningIcon`
- Check: `CheckCircleIcon`
- Info: `InfoIcon`
- Close: `XIcon`

There is **no** `DownloadIcon`, `AiIcon`, `DragIcon`, `DeleteIcon`, `PlusCircleIcon`, or `Divider` in F36 v5.

## F36 Card Padding

`Card padding` only accepts `"default"`, `"none"`, or `"large"`. Not `"spacingS"` or `"spacingM"`.

## Config Screen Sections

The Config Screen has 7 sections. The `activeSection` state type must include all of them:
`'analytics' | 'modules' | 'theme' | 'cards' | 'ai' | 'p13n' | 'contentful-analytics'`

## AppInstallationParameters Shape

```ts
interface AppInstallationParameters {
  // Production metrics (from content-insights)
  defaultContentTypes?: string[];
  needsUpdateMonths?: number;
  recentlyPublishedDays?: number;
  showUpcomingReleases?: boolean;
  timeToPublishDays?: number;
  defaultCreatorViewSetting?: CreatorViewSetting;

  // Module system
  modules?: ModuleConfig[];          // { id, enabled, order }[]

  // Theming
  theme?: ThemeConfig;

  // Custom cards
  customCards?: CustomCard[];

  // Search
  savedSearches?: SavedSearch[];

  // AI Audit
  aiActionId?: string;

  // Personalization
  ninetailedApiKey?: string;
  ninetailedEnvironmentId?: string;

  // Contentful Analytics
  analyticsApiKey?: string;
}
```

## Adding a New Module

1. `mkdir src/modules/my-module`
2. Create `MyModule.tsx` — `export function MyModule({ installationParams }: ModuleProps)`
3. Create `MyModuleWidget.tsx` — `export function MyModuleWidget({ installationParams, onNavigate }: HomeWidgetProps)` (optional but recommended)
4. Create `index.ts`:
   ```ts
   import { registerModule } from '../registry';
   import { MyModule } from './MyModule';
   import { MyModuleWidget } from './MyModuleWidget';

   registerModule({
     id: 'my-module',
     label: 'My Module',
     description: 'One-line description for the Config Screen.',
     icon: 'SomeIcon',       // string label only, not used for rendering currently
     defaultEnabled: true,
     defaultOrder: 11,       // after existing modules
     component: MyModule,
     homeWidget: MyModuleWidget,
   });
   ```
5. Add `import './my-module';` to `src/modules/index.ts`

The module appears in: tab bar, Config Screen module manager, Home widget grid.

## Verification Checklist Before Committing

- `npm run build` passes (tsc + vite)
- `npm run lint` passes (no errors, no warnings)
- No `any` without justification
- All F36 icon names are correct (see Icon Names above)
- Card padding uses only `"default"`, `"none"`, or `"large"`
- New modules registered in `src/modules/index.ts`
- New `AppInstallationParameters` fields added to `src/modules/types.ts`
