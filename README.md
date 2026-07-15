# Content Health Dashboard

A Contentful App Framework app that gives content teams and Solutions Engineers a single pane of glass for **production metrics, content quality, localization coverage, SEO/GEO signals, personalization, and analytics** — all driven live from your space's CMA data with no external hosting or data warehouse required.

Forked from Contentful's open-source [`content-insights`](https://github.com/contentful/apps/tree/master/apps/content-insights) app and extended with 10 additional quality and ops modules plus **App Functions** for zero-infrastructure AI operations.

---

## One-click install

```
https://app.contentful.com/deeplink?link=apps&id=4AN7Y3TNUkq1aglEP5DnFY
```

Install to any space in your Contentful org. The app renders at the **Home**, **Page**, **Entry Sidebar**, and **App Config** locations. After installing, open Config Screen to enable modules, configure AI Action IDs, and optionally set up App Functions.

---

## Space Health Score

The headline feature: one **0–100 composite score with a letter grade** for the whole space, computed from six weighted dimensions — reference integrity, asset health, content freshness, localization coverage, SEO/GEO readiness, and taxonomy adoption. It renders as an animated hero on **Home** and as the **Overview** tab on the Page location, with a ranked **"What to fix first"** action list that deep-links into the relevant module, plus an exportable CSV health report.

The computation (`src/lib/healthScore.ts`) is a pure function over plain data — deliberately, so a future **organization app location** can run it once per space and roll health up across an entire org.

## Entry Sidebar — live health while you write

Add the app to any content type's sidebar and editors get a **live health score for the entry they're editing**: completeness, SEO/AEO/GEO signals, and alt-text coverage of linked assets, re-scored as they type. One click grades the entry with AI (via the `gradeContent` App Function) and shows a quality score with concrete suggestions.

## Auto-grade on publish

With an App Event Subscription (one command, see setup), every published entry is graded server-side and the result lands as a **comment on the entry** — "🩺 Content Health: 72/100" with top suggestions — right where editors work. Zero content model changes.

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
| `onEntryPublish` | App Event handler — grades an entry on publish and posts the score as a comment on the entry |

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

3. **Set OpenAI API key** (optional — only needed when no Contentful AI Action is configured) — enter it in **Config Screen → App Functions → OpenAI API key**, or set it via CLI:
   ```bash
   contentful app-installation update \
     --space-id <SPACE_ID> \
     --environment-id master \
     --app-definition-id 4AN7Y3TNUkq1aglEP5DnFY \
     --parameters '{"openAiApiKey":"sk-..."}'
   ```

4. **Configure in Config Screen** — go to **Config Screen → App Functions** and enter the App Action IDs or Contentful AI Action IDs for Translation, Alt Text, Content Audit, and SEO / GEO Audit.

5. **Auto-grade on publish** (optional) — subscribe the app to `Entry.publish` events targeting the `onEntryPublish` function:
   ```bash
   npm run setup-events
   ```

6. **Entry sidebar** (optional) — add the **Entry sidebar** location to the app definition (`npm run add-locations` or the web UI), then enable the app in a content type's sidebar via the editor's Sidebar settings.

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
| **Asset Health** | Alt text sources — native asset fields and/or wrapper content type fields (e.g. `assetWrapper.caption`) |

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

**Demo mode / standalone development** — run the whole app outside Contentful on a seeded demo space (no login, stable data — great for screenshots and prospect demos):

```bash
VITE_MOCK_SDK=1 npm start
# → http://localhost:3000/?loc=home | ?loc=page | ?loc=config | ?loc=sidebar
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
│   ├── ConfigScreen.tsx      # 10-section config
│   ├── Home.tsx              # Space Health hero + draggable widget grid
│   ├── Page.tsx              # Overview tab + tabbed module shell
│   └── Sidebar.tsx           # Live per-entry health score
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
│   ├── healthScore.ts        # Pure Space Health computation (org-rollup ready)
│   ├── aiActions.ts          # invokeAppActionAndWait, invokeAiActionAndWait helpers
│   ├── appActions.ts         # App Action sys.id lookup from manifest
│   ├── completeness.ts       # Field completeness heuristics
│   ├── entryTitle.ts         # Safe entry title extraction
│   ├── richText.ts           # Rich text → plain text
│   ├── csv.ts
│   └── openInNewTab.ts
├── dev/
│   └── mockToolkit.tsx       # VITE_MOCK_SDK=1 demo mode (seeded fake space)
functions/
├── translateFields.ts        # App Function: translate entry fields server-side
├── generateAltText.ts        # App Function: generate alt text for an asset
├── gradeContent.ts           # App Function: AI content quality scoring
├── seoAudit.ts               # App Function: LLM-enhanced SEO/GEO scoring
├── onEntryPublish.ts         # App Event handler: grade on publish → entry comment
├── _grading.ts               # Shared LLM grading core
├── _params.ts                # Shared installation-parameter access
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
