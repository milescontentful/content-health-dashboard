# Content Health Dashboard

A Contentful App Framework app that gives content teams and Solutions Engineers a single pane of glass for **production metrics, content quality, localization coverage, SEO/GEO signals, personalization, and analytics** — all driven live from your space's CMA data with no external hosting or data warehouse required.

Forked from Contentful's open-source [`content-insights`](https://github.com/contentful/apps/tree/master/apps/content-insights) app and extended with 10 additional quality and ops modules plus **App Functions** for zero-infrastructure AI operations.

---

## One-click install

```
https://app.contentful.com/deeplink?link=apps&id=4AN7Y3TNUkq1aglEP5DnFY
```

Install to any space in your Contentful org. The app renders at the **Home**, **Page**, and **App Config** locations. After installing, open Config Screen to enable modules, configure AI Action IDs, and optionally set up App Functions.

---

## Modules

| # | Tab | What it shows |
|---|---|---|
| 1 | **Production** | Publishing velocity, avg time-to-publish, scheduled releases, stale content |
| 2 | **Localization** | Entries × locales coverage heatmap with publish status + one-click translation via App Functions |
| 3 | **Search** | Visual AND/OR/NOT query builder with paginated results and CSV export |
| 4 | **SEO / GEO** | Per-entry scorecards across classic SEO, Answer Engine (AEO), and Generative Engine (GEO) signals with AI copy suggestions. Export CSV |
| 5 | **Assets** | Orphaned assets, missing alt text, oversized files, format breakdown. Export CSV |
| 6 | **Taxonomy** | Concept assignment coverage % per content type |
| 7 | **Cards** | Free-form content cards authored in Config Screen (talking points, links, demo notes) |
| 8 | **References** | Broken links, orphaned entries, high blast-radius entries. Export CSV |
| 9 | **AI Audit** | Content quality scoring, completeness check, and brand voice alignment via App Functions. Export CSV |
| 10 | **Personalization** | Ninetailed experience coverage, A/B experiments, and audience targeting. CMA-native — no extra API key required |
| 11 | **Analytics** | 30-day publishing velocity + top content types |

Every module has a **Home location widget** that shows compact live metrics and links directly to its full tab.

---

## App Functions (zero external hosting)

Four App Functions run on Contentful's infrastructure — no Vercel, no Lambda, no local machine needed. They are bundled into the app and uploaded alongside the frontend.

| Function | What it does |
|---|---|
| `translateFields` | Fetches entry + content type server-side, translates each localizable field via a Contentful AI Action, and writes translations back to the entry |
| `generateAltText` | Generates accessible alt text for an asset image via a Contentful AI Action |
| `gradeContent` | Scores content quality (0–100), returns a summary, actionable suggestions, and optional brand voice alignment score |
| `seoAudit` | Enriches heuristic SEO/AEO/GEO scores with LLM semantic analysis and returns AI-rewritten meta title + description suggestions |

### Setup (one-time per org)

1. **Build and upload**
   ```bash
   npm run build:all
   npm run upload
   ```
   Activate the bundle when prompted.

2. **Create App Actions** — in your [App Definition Actions tab](https://app.contentful.com/deeplink?link=app-definition&tab=actions), the four actions are pre-declared in `contentful-app-manifest.json`. Run:
   ```bash
   npm run upsert-actions
   ```
   This creates/updates all four App Actions and writes their `sys.id` values back into the manifest.

3. **Set OpenAI API key** (optional — only needed for `gradeContent` and `seoAudit` LLM enhancement) — store as a **private installation parameter** so it is never exposed to the browser:
   ```bash
   contentful app-installation update \
     --space-id <SPACE_ID> \
     --environment-id master \
     --app-definition-id 4AN7Y3TNUkq1aglEP5DnFY \
     --parameters '{"openAiApiKey":"sk-..."}'
   ```

4. **Configure in Config Screen** — go to **Config Screen → App Functions** and enter the App Action IDs or Contentful AI Action IDs for Translation, Alt Text, Content Audit, and SEO / GEO Audit.

> **No OpenAI key?** Translation and alt text use Contentful's native AI Actions — no external key needed. The App Functions proxy them server-side to work around the iframe restriction.

---

## Configuration

All settings are saved to installation parameters via the Config Screen:

| Section | What you configure |
|---|---|
| **Analytics** | Stale content threshold, recently-published window, time-to-publish target, default content types |
| **Modules** | Enable/disable each module, drag to reorder tabs |
| **Theme** | Dashboard title, accent color, background image, brand logo |
| **Custom Cards** | Free-form cards with titles, bullet points, and optional links |
| **App Functions** | App Action IDs for all four functions, SEO/GEO page content types filter, brand voice guidelines |
| **Personalization** | Optional Ninetailed Management API key |
| **Contentful Analytics** | Optional Contentful Analytics API key |
| **Reference Risk** | Top-level content types to exclude from orphaned entry detection |

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

This registers the app in your org, lets you pick locations (**App configuration**, **Page**, **Home**), and writes a `.env` file with your org and app definition IDs.

### 3. Start the dev server

```bash
npm start
# → http://localhost:3000
```

In Contentful: **Apps → Manage apps → your app definition → Edit → set App URL to `http://localhost:3000`**. Install to a space, open it from the left nav.

> App Functions cannot be tested locally — they require an uploaded bundle. Run `npm run build:all && npm run upload` to test function-backed features.

### 4. Build for production

```bash
npm run build:all   # builds frontend + all four App Functions
npm run upload      # uploads bundle to Contentful CDN (interactive)
```

### Available scripts

| Script | What it does |
|---|---|
| `npm start` | Dev server on port 3000 |
| `npm run build` | Frontend only |
| `npm run build:functions` | App Functions only |
| `npm run build:all` | Frontend + functions |
| `npm run upload` | Upload bundle to Contentful CDN |
| `npm run upsert-actions` | Create/update App Actions from manifest |
| `npm test` | Vitest test suite |

---

## Repo layout

```
src/
├── locations/
│   ├── ConfigScreen.tsx      # 8-section config
│   ├── Home.tsx              # Draggable widget grid
│   └── Page.tsx              # Tabbed page shell
├── modules/
│   ├── types.ts              # AppInstallationParameters, DashboardModule
│   ├── registry.ts           # Module registration + getEnabledModules()
│   ├── localization-coverage/
│   ├── seo-aeo-geo/
│   ├── ai-audit/
│   ├── asset-health/
│   ├── taxonomy-coverage/
│   ├── search-builder/
│   ├── reference-risk/
│   ├── personalization/
│   ├── analytics/
│   ├── production-metrics/
│   └── custom-content/
├── lib/
│   ├── aiActions.ts          # invokeAppActionAndWait, invokeAiActionAndWait helpers
│   ├── appActions.ts         # App Action sys.id lookup from manifest
│   ├── csv.ts
│   └── openInNewTab.ts
functions/
├── translateFields.ts        # App Function: translate entry fields server-side
├── generateAltText.ts        # App Function: generate alt text for an asset
├── gradeContent.ts           # App Function: AI content quality scoring
├── seoAudit.ts               # App Function: LLM-enhanced SEO/GEO scoring
└── _aiActionProxy.ts         # Shared: proxies Contentful AI Actions server-side
contentful-app-manifest.json  # App Functions + App Actions manifest
```

---

## Adding a new module

1. Create `src/modules/your-module/YourModule.tsx` — export a component accepting `ModuleProps`
2. Optionally create `YourModuleWidget.tsx` accepting `HomeWidgetProps`
3. Create `index.ts` and call `registerModule({ id, label, description, icon, defaultEnabled, defaultOrder, component, homeWidget? })`
4. Add `import './your-module'` to `src/modules/index.ts`

The module appears automatically in the tab bar, Config Screen, and Home grid.

---

## Provenance

Forked from [`contentful/apps/apps/content-insights`](https://github.com/contentful/apps/tree/master/apps/content-insights) (Apache 2.0). Extension modules and App Functions are original work built for Contentful Solutions Engineering demos.
