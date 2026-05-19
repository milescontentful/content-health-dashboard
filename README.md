# Content Health Dashboard

A Contentful App Framework app that gives content and ops teams a single pane of glass for both **production metrics** (velocity, scheduling, freshness) and **content quality** (localization coverage, SEO/a11y, asset health, AI audits).

Forked from Contentful's open-source [`content-insights`](https://github.com/contentful/apps/tree/master/apps/content-insights) app and extended with quality modules.

---

## What it does

Renders in three Contentful locations:

- **Home** — compact "Content Health Score" widget
- **Page** — full dashboard with tabbed modules
- **App Configuration** — setup screen

### Baseline modules (inherited from Content Insights)

- Publishing velocity over time
- Average time to publish
- Recently published entries
- Scheduled releases (with reschedule/unschedule actions)
- "Needs update" stale content detection

### Extension modules (in progress)

- Localization coverage matrix (entries × locales heatmap)
- Asset health (orphans, oversized, missing alt text, format breakdown)
- SEO / a11y audit
- AI Content Audit (powered by AI Actions)
- Taxonomy coverage (% entries with concepts assigned per content type)
- Reference risk (most-referenced entries → highest blast radius on edit)

---

## Tech stack

- React 18 + TypeScript + Vite
- [Forma 36](https://f36.contentful.com/) design system
- [`@contentful/app-sdk`](https://www.contentful.com/developers/docs/extensibility/app-framework/sdk/) + [`@contentful/react-apps-toolkit`](https://github.com/contentful/react-apps-toolkit)
- [`contentful-management`](https://github.com/contentful/contentful-management.js) (CMA)
- TanStack Query for data fetching and caching
- Recharts for charts
- Vitest + React Testing Library for tests

---

## Local development

### Prerequisites

- Node.js 20+
- A Contentful organization where you can create an App Definition
- A Contentful Personal Access Token (or app identity token) with org-level app management scope

### 1. Install

```bash
npm install
```

### 2. Create your App Definition

The app needs to be registered against your Contentful organization before it can be installed in a space.

```bash
npm run create-app-definition
```

This walks you through:

- Selecting an organization
- Naming the app (e.g. "Content Health Dashboard")
- Picking the locations to enable: **App configuration**, **Page**, **Home**
- Pointing it at `http://localhost:3000` for local dev

It writes a `.env` file with your `CONTENTFUL_ORG_ID` and `CONTENTFUL_APP_DEF_ID`. See `.env.example` for the full list.

### 3. Run the dev server

```bash
npm start
```

Opens on `http://localhost:3000`. Now install the app into a space from your Contentful web app (Apps → Custom apps → your app), and it will render the local build inside Contentful.

### 4. Build for production

```bash
npm run build
```

Output goes to `./build`.

### 5. Deploy a hosted bundle (optional)

If the client wants Contentful to host the bundle rather than running locally:

```bash
npm run upload
```

This bundles `./build` and uploads it as a new version of your App Definition. Switch the app definition's URL from `http://localhost:3000` to "Hosted by Contentful" in the org settings.

---

## Demo data scripts

The app ships with two helper scripts that seed and clean up a demo space, useful for SE demos:

```bash
npm run generate-entries    # populate a demo space with sample content
npm run delete-entries      # tear it back down
```

Configure target space/environment in `.env` (`CONTENTFUL_SPACE_ID`, `CONTENTFUL_ENVIRONMENT_ID`, `CONTENTFUL_MANAGEMENT_TOKEN`).

---

## Testing & quality

```bash
npm test            # vitest watch
npm run test:ci     # single run for CI
npm run lint
npm run lint:fix
npm run prettier
```

---

## Repo layout

```
src/
├── App.tsx
├── index.tsx
├── locations/        # ConfigScreen, Home, Page
├── components/       # Charts, metric cards, tables
├── hooks/            # CMA-backed react-query hooks
├── metrics/          # Aggregation logic (MetricsCalculator)
├── utils/            # Date helpers, validators, types
└── scripts/          # Demo seed/cleanup utilities
test/                 # Vitest tests + mocks
```

See `AGENTS.md` for architecture notes and extension guidance.

---

## Provenance

This is a fork of [`contentful/apps/apps/content-insights`](https://github.com/contentful/apps/tree/master/apps/content-insights), Apache 2.0 licensed. Extension modules are original work for Solutions Engineering demos.
