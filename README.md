# Content Health Dashboard

A Contentful App Framework app that gives content teams and SEs a single pane of glass for **production metrics, content quality, personalization coverage, and analytics** — all driven live from your space's CMA data with no external data warehouse required.

Forked from Contentful's open-source [`content-insights`](https://github.com/contentful/apps/tree/master/apps/content-insights) app and extended with 10 additional quality and ops modules.

---

## Modules

The dashboard renders at three Contentful locations:

| Location | What it does |
|---|---|
| **Home** | Draggable widget grid with a health summary bar. Click any card to jump to that tab. Order auto-saves. |
| **Page** | Full tabbed dashboard — one tab per enabled module |
| **App Config** | Enable/disable modules, drag to reorder, theme, custom cards, and optional API keys |

### All 11 modules

| # | Tab | What it shows |
|---|---|---|
| 1 | **Production** | Publishing velocity, avg time-to-publish, scheduled releases, stale content |
| 2 | **Localization** | Entries × locales coverage heatmap |
| 3 | **Search** | Visual AND/OR/NOT query builder with paginated results and CSV export |
| 4 | **SEO / AEO / GEO** | Per-entry scorecards across classic SEO, Answer Engine, and Generative Engine signals. Export CSV |
| 5 | **Assets** | Orphaned assets, missing alt text, oversized files, format breakdown. Export CSV |
| 6 | **Taxonomy** | Concept assignment coverage % per content type |
| 7 | **Cards** | Free-form content cards authored in Config Screen (talking points, links, demo notes) |
| 8 | **References** | Broken links, orphaned entries, high blast-radius entries. Export CSV |
| 9 | **AI Audit** | Calls a Contentful AI Action to score content quality per entry. Export CSV |
| 10 | **Personalization** | Ninetailed experience coverage, A/B experiments, and audience targeting. CMA-native — no extra API key required. Shows setup guide if Ninetailed is not installed |
| 11 | **Analytics** | 30-day publishing velocity + top content types. Contentful Analytics tab ready to wire up when the API ships |

Every module has a **Home location widget** that shows compact live metrics and links directly to its full tab.

---

## Tech stack

- React 18 + TypeScript + Vite
- [Forma 36](https://f36.contentful.com/) design system
- [`@contentful/app-sdk`](https://www.contentful.com/developers/docs/extensibility/app-framework/sdk/) + [`@contentful/react-apps-toolkit`](https://github.com/contentful/react-apps-toolkit)
- `contentful-management` (CMA) — all data is live from the space, no external DB
- TanStack Query for caching
- Recharts for charts
- `@dnd-kit` for drag-and-drop (Config Screen module reorder + Home widget reorder)
- Vitest + React Testing Library

---

## Local development

### Prerequisites

- Node.js 20+
- A Contentful organization where you can create an App Definition
- A Contentful Personal Access Token with org-level app management scope

### 1. Install

```bash
npm install
```

### 2. Create your App Definition

```bash
npm run create-app-definition
```

This registers the app in your org, lets you pick locations (**App configuration**, **Page**, **Home**), and writes a `.env` file with your org and app definition IDs. See `.env.example` for the full list of variables.

### 3. Start the dev server

```bash
npm start
# → http://localhost:3000
```

In Contentful: **Apps → Manage apps → your app definition → Edit → set App URL to `http://localhost:3000`**. Install to a space, open it from the left nav, and the local build renders inside Contentful with hot reload.

> If another app is already on port 3000: `npm start -- --port 3001` and update the App URL accordingly.

### 4. Build for production

```bash
npm run build
# output → ./build
```

### 5. Deploy a hosted bundle

Upload the bundle to Contentful's CDN so clients don't need your local server:

```bash
npm run upload
```

Then switch the app definition's source from `http://localhost:3000` to **Hosted by Contentful** in your org settings.

---

## Configuration

All settings are saved to **installation parameters** via the Config Screen:

| Section | What you configure |
|---|---|
| **Analytics** | Stale content threshold, recently-published window, time-to-publish target, default content types |
| **Modules** | Enable/disable each module, drag to reorder tabs |
| **Theme** | Dashboard title, accent color, background image, brand logo |
| **Custom Cards** | Free-form cards with titles, bullet points, and optional links |
| **AI Audit** | App Action ID for the `grade-content` AI Action |
| **Personalization** | Optional Ninetailed Management API key (for future impression/CVR data) |
| **Contentful Analytics** | Optional Contentful Analytics API key (ready for when the API ships) |

---

## AI Audit setup

The AI Audit module calls a Contentful **App Action** to score content quality. To enable it:

1. In your App Definition, add an action with ID `grade-content` (type: endpoint)
2. The handler receives `{ entryId, title, body, contentType }` and must return `{ score: number, summary: string, suggestions: string[] }`
3. Set the action ID in **Config Screen → AI Audit**

The module shows a step-by-step setup guide inline when not configured.

Docs: [Contentful App Actions](https://www.contentful.com/developers/docs/extensibility/app-framework/app-actions/)

---

## Personalization (Ninetailed)

The Personalization module detects Ninetailed by querying for `nt_experience` and `nt_audience` content types — no API key required for coverage data. It shows a setup guide with Marketplace links when Ninetailed is not installed in the space.

An optional Ninetailed Management API key can be added in Config Screen for future impression/conversion analytics.

---

## Repo layout

```
src/
├── App.tsx
├── index.tsx
├── locations/
│   ├── ConfigScreen.tsx      # 7-section config: analytics, modules, theme, cards, AI, p13n, analytics
│   ├── Home.tsx              # Draggable widget grid + health summary bar
│   └── Page.tsx              # Tabbed page shell driven by module registry
├── modules/
│   ├── types.ts              # DashboardModule, AppInstallationParameters, ThemeConfig
│   ├── registry.ts           # registerModule(), getEnabledModules(), getModuleConfigs()
│   ├── index.ts              # Imports all modules (side-effect registration)
│   ├── StudioThemeProvider.tsx
│   ├── production-metrics/
│   ├── localization-coverage/
│   ├── search-builder/
│   ├── seo-aeo-geo/
│   ├── asset-health/
│   ├── taxonomy-coverage/
│   ├── custom-content/
│   ├── reference-risk/
│   ├── ai-audit/
│   ├── personalization/
│   └── analytics/
├── lib/
│   ├── csv.ts                # Lightweight CSV export (BOM, no deps)
│   └── openInNewTab.ts       # Opens Contentful entries/assets in a new browser tab
├── components/               # Charts, metric cards, tables (from content-insights)
├── hooks/                    # CMA-backed react-query hooks
├── metrics/                  # MetricsCalculator.ts
└── utils/                    # types, dateUtils, Validator, consts
test/                         # Vitest tests + mocks (162 passing from upstream)
```

---

## Adding a new module

1. Create `src/modules/your-module/YourModule.tsx` — export a React component accepting `ModuleProps`
2. Optionally create `YourModuleWidget.tsx` — compact Home widget accepting `HomeWidgetProps`
3. Create `index.ts` and call `registerModule({ id, label, description, icon, defaultEnabled, defaultOrder, component, homeWidget? })`
4. Add `import './your-module'` to `src/modules/index.ts`

The module appears automatically in the tab bar, Config Screen module manager, and Home grid.

---

## Provenance

Forked from [`contentful/apps/apps/content-insights`](https://github.com/contentful/apps/tree/master/apps/content-insights) (Apache 2.0). Extension modules are original work built for Contentful Solutions Engineering demos.
