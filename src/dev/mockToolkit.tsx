/**
 * Mock SDK harness — lets the whole app render standalone (outside Contentful)
 * with a seeded demo space. Two jobs:
 *   1. Screenshot-driven UI iteration without a Contentful login.
 *   2. "Demo mode": show the app to a prospect with rich, realistic data.
 *
 * Activated by running:  VITE_MOCK_SDK=1 npm start
 * (vite.config aliases '@contentful/react-apps-toolkit' to this file)
 *
 * Pick a location with ?loc=home | page | config | sidebar (default: page).
 */
import type { ReactNode } from 'react';

// ─── Seeded demo data ─────────────────────────────────────────────────────────

const LOCALES = [
  { code: 'en-US', name: 'English (US)', default: true },
  { code: 'de-DE', name: 'German', default: false },
  { code: 'fr-FR', name: 'French', default: false },
];

const NOW = Date.now();
const days = (n: number) => new Date(NOW - n * 864e5).toISOString();

const CONTENT_TYPES = [
  {
    sys: { id: 'page' },
    name: 'Page',
    fields: [
      { id: 'title', name: 'Title', type: 'Symbol', required: true, localized: true },
      { id: 'slug', name: 'Slug', type: 'Symbol', required: true, localized: false },
      { id: 'metaDescription', name: 'Meta Description', type: 'Symbol', required: false, localized: true },
      { id: 'body', name: 'Body', type: 'Text', required: false, localized: true },
      { id: 'heroImage', name: 'Hero Image', type: 'Link', required: false, localized: false },
    ],
  },
  {
    sys: { id: 'blogPost' },
    name: 'Blog Post',
    fields: [
      { id: 'title', name: 'Title', type: 'Symbol', required: true, localized: true },
      { id: 'body', name: 'Body', type: 'Text', required: true, localized: true },
      { id: 'image', name: 'Image', type: 'Link', required: false, localized: false },
      { id: 'relatedPages', name: 'Related Pages', type: 'Array', required: false, localized: false },
    ],
  },
  {
    sys: { id: 'assetWrapper' },
    name: 'Asset Wrapper',
    fields: [
      { id: 'caption', name: 'Caption', type: 'Symbol', required: false, localized: true },
      { id: 'image', name: 'Image', type: 'Link', required: true, localized: false },
    ],
  },
];

// Deterministic pseudo-random so screenshots are stable between runs
let seed = 42;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const PLACEHOLDER = (i: number) => `https://picsum.photos/seed/chd${i}/640/400`;

const ASSETS = Array.from({ length: 22 }, (_, i) => {
  const missingAlt = i % 4 === 1; // ~25% missing alt text
  const oversized = i % 9 === 2;
  return {
    sys: { id: `asset-${i}`, updatedAt: days(Math.floor(rand() * 300)) },
    fields: {
      title: { 'en-US': `Campaign visual ${i + 1}` },
      ...(missingAlt ? {} : { description: { 'en-US': `Product hero shot ${i + 1} on a studio background` } }),
      file: {
        'en-US': {
          url: PLACEHOLDER(i).replace('https:', ''),
          contentType: i % 5 === 4 ? 'image/png' : 'image/jpeg',
          details: { size: oversized ? 780_000 : 120_000 + Math.floor(rand() * 200_000) },
        },
      },
    },
  };
});

const TITLES = [
  'Summer launch landing page', 'Pricing', 'About us', 'Careers', 'Contact',
  'Product tour', 'Customer stories', 'Integrations', 'Security overview', 'Changelog',
  'How we build fast websites', 'Composable content 101', 'Migration playbook',
  'Personalization at scale', 'The AEO handbook', 'Design tokens deep dive',
  'Q3 campaign recap', 'Holiday gift guide', 'Partner spotlight: Acme', 'Webinar: content ops',
];

function makeEntries() {
  const entries: any[] = [];
  let assetIdx = 0;

  for (let i = 0; i < 20; i++) {
    const isPage = i < 10;
    const stale = i % 5 === 3; // ~20% stale
    const missingMeta = i % 3 === 1;
    const hasGerman = i % 2 === 0;
    const hasFrench = i % 4 === 0;
    const tagged = i % 3 === 0;
    const title = TITLES[i];
    const loc = (en: string, suffix: string) => ({
      'en-US': en,
      ...(hasGerman ? { 'de-DE': `${en} (DE${suffix})` } : {}),
      ...(hasFrench ? { 'fr-FR': `${en} (FR${suffix})` } : {}),
    });
    const linkedAsset = `asset-${assetIdx++ % ASSETS.length}`;

    entries.push({
      sys: {
        id: `entry-${i}`,
        contentType: { sys: { id: isPage ? 'page' : 'blogPost' } },
        createdAt: days(300 - i * 10),
        updatedAt: stale ? days(280) : days(Math.floor(rand() * 60)),
        publishedAt: days(Math.floor(rand() * 50) + 1),
        publishedVersion: 4,
        version: i % 6 === 5 ? 6 : 5, // a few "changed" entries
        createdBy: { sys: { id: `user-${i % 3}` } },
      },
      metadata: tagged ? { concepts: [{ sys: { id: 'concept-brand' } }] } : { concepts: [] },
      fields: isPage
        ? {
            title: loc(title, ''),
            slug: { 'en-US': title.toLowerCase().replace(/[^a-z0-9]+/g, '-') },
            ...(missingMeta ? {} : { metaDescription: loc(`${title} — everything you need to know about our platform and how teams ship faster with structured content.`, '-meta') }),
            body: loc(`# ${title}\n\nWhat is ${title.toLowerCase()}? It is the definitive guide. According to our 2026 research, 78% of teams ship faster with structured content. You can start today.\n\n## Key facts\n\nFor example, our customers report 40% faster publishing cycles.`, '-body'),
            heroImage: { 'en-US': { sys: { type: 'Link', linkType: 'Asset', id: linkedAsset } } },
          }
        : {
            title: loc(title, ''),
            body: loc(`${title}: a long-form exploration. ${'Structured content wins. '.repeat(12)}`, '-body'),
            image: { 'en-US': { sys: { type: 'Link', linkType: 'Asset', id: linkedAsset } } },
            // entry-17 carries a broken reference on purpose (demo data)
            relatedPages: {
              'en-US': [
                { sys: { type: 'Link', linkType: 'Entry', id: i === 17 ? 'entry-deleted' : `entry-${(i + 1) % 20}` } },
              ],
            },
          },
    });
  }

  // Asset wrappers: give 4 of the alt-less assets wrapper captions
  for (let w = 0; w < 6; w++) {
    entries.push({
      sys: {
        id: `wrapper-${w}`,
        contentType: { sys: { id: 'assetWrapper' } },
        createdAt: days(100), updatedAt: days(20), publishedAt: days(10),
        publishedVersion: 2, version: 3,
        createdBy: { sys: { id: 'user-1' } },
      },
      metadata: { concepts: [] },
      fields: {
        ...(w < 4 ? { caption: { 'en-US': `Wrapped caption ${w}` } } : {}),
        image: { 'en-US': { sys: { type: 'Link', linkType: 'Asset', id: `asset-${w * 3 + 1}` } } },
      },
    });
  }
  return entries;
}

const ENTRIES = makeEntries();

// ─── Query-aware collection endpoint ─────────────────────────────────────────

function applyQuery(items: any[], query: any = {}): { items: any[]; total: number } {
  let out = [...items];
  if (query.content_type) out = out.filter((e) => e.sys.contentType?.sys?.id === query.content_type);
  if (query['sys.publishedAt[exists]']) out = out.filter((e) => !!e.sys.publishedAt);
  if (query['sys.id[in]']) {
    const ids = new Set(String(query['sys.id[in]']).split(','));
    out = out.filter((e) => ids.has(e.sys.id));
  }
  if (query.order === '-sys.publishedAt') {
    out.sort((a, b) => String(b.sys.publishedAt ?? '').localeCompare(String(a.sys.publishedAt ?? '')));
  } else if (query.order === '-sys.updatedAt') {
    out.sort((a, b) => String(b.sys.updatedAt ?? '').localeCompare(String(a.sys.updatedAt ?? '')));
  }
  const total = out.length;
  const skip = query.skip ?? 0;
  const limit = query.limit ?? 100;
  return { items: out.slice(skip, skip + limit), total };
}

const collection = (items: any[]) => ({ items, total: items.length });

// ─── Mock CMA ─────────────────────────────────────────────────────────────────

const latency = <T,>(v: T, ms = 250): Promise<T> => new Promise((r) => setTimeout(() => r(v), ms));

const cma = {
  entry: {
    getMany: ({ query }: any = {}) => latency({ ...applyQuery(ENTRIES, query), sys: { type: 'Array' } }),
    get: ({ entryId }: any) => latency(ENTRIES.find((e) => e.sys.id === entryId) ?? Promise.reject(new Error('Not found'))),
    publish: () => latency({}),
    update: () => latency({}),
  },
  asset: {
    getMany: ({ query }: any = {}) => latency({ ...applyQuery(ASSETS, query), sys: { type: 'Array' } }),
    get: ({ assetId }: any) => latency(ASSETS.find((a) => a.sys.id === assetId)),
    update: (_p: any, data: any) => latency(data),
  },
  contentType: {
    getMany: () => latency(collection(CONTENT_TYPES)),
    get: ({ contentTypeId }: any) => latency(CONTENT_TYPES.find((c) => c.sys.id === contentTypeId)),
  },
  locale: { getMany: () => latency(collection(LOCALES)) },
  release: { query: () => latency(collection([])) },
  scheduledActions: {
    getMany: () => latency(collection([])),
    get: () => latency({}),
    update: () => latency({}),
    delete: () => latency({}),
  },
  user: {
    getManyForSpace: () => latency(collection([
      { sys: { id: 'user-0' }, firstName: 'Dana', lastName: 'Editor', email: 'dana@example.com' },
      { sys: { id: 'user-1' }, firstName: 'Sam', lastName: 'Writer', email: 'sam@example.com' },
      { sys: { id: 'user-2' }, firstName: 'Alex', lastName: 'Marketer', email: 'alex@example.com' },
    ])),
  },
  appInstallation: {
    upsert: () => latency({}),
    getForOrganization: () => latency(collection([])),
  },
  appActionCall: {
    // Canned AI grade so "Grade with AI" works in demo mode
    createWithResponse: () => latency({
      response: {
        body: JSON.stringify({
          score: 72,
          summary: 'Solid structure and clear messaging; the body copy is thin in places and the meta description is missing.',
          suggestions: [
            'Add a 140–160 character meta description with the primary keyword.',
            'Expand the body to at least 300 words for stronger topical coverage.',
            'Add one internal link to a related page.',
          ],
        }),
      },
    }, 1200),
  },
  aiAction: { get: () => latency({}), invoke: () => latency({}) },
  aiActionInvocation: { get: () => latency({}) },
};

// ─── Mock SDK ─────────────────────────────────────────────────────────────────

const INSTALL_PARAMS = {
  seoPageContentTypes: ['page'],
  aiActionId: 'grade-content',
  altTextSources: [
    { contentType: '__asset__', field: 'description' },
    { contentType: 'assetWrapper', field: 'caption' },
  ],
  needsUpdateMonths: 6,
};

const LOC_MAP: Record<string, string> = {
  home: 'home',
  page: 'page',
  config: 'app-config',
  sidebar: 'entry-sidebar',
};

const locParam = new URLSearchParams(window.location.search).get('loc') ?? 'page';
const activeLocation = LOC_MAP[locParam] ?? 'page';

// Sidebar mocks: entry-1 (a page with missing meta) is being "edited"
const sidebarEntry = ENTRIES[1];
const fieldApis = Object.fromEntries(
  CONTENT_TYPES[0].fields.map((f) => [
    f.id,
    {
      getValue: () => (sidebarEntry.fields as any)[f.id]?.['en-US'],
      onValueChanged: (_cb: any) => () => {},
      setValue: async () => {},
    },
  ]),
);

const sdk: any = {
  location: { is: (l: string) => l === activeLocation },
  parameters: { installation: INSTALL_PARAMS, instance: {}, invocation: {} },
  locales: { default: 'en-US', available: LOCALES.map((l) => l.code) },
  ids: { app: 'mock-app', space: 'mock-space', environment: 'master', entry: sidebarEntry.sys.id },
  cma,
  notifier: {
    success: (m: string) => console.log('[notifier]', m),
    error: (m: string) => console.warn('[notifier]', m),
  },
  navigator: {
    openCurrentAppPage: () => { window.location.search = '?loc=page'; },
    openAppPage: () => { window.location.search = '?loc=page'; },
    openEntry: () => {},
    openAsset: () => {},
  },
  app: { setReady: async () => {}, getParameters: async () => INSTALL_PARAMS, onConfigure: () => {}, onConfigurationCompleted: () => {} },
  window: { startAutoResizer: () => {}, stopAutoResizer: () => {}, updateHeight: () => {} },
  dialogs: { selectSingleAsset: async () => null },
  entry: {
    fields: fieldApis,
    getSys: () => sidebarEntry.sys,
    onSysChanged: (_cb: any) => () => {},
  },
  contentType: CONTENT_TYPES[0],
  user: { firstName: 'Miles', lastName: 'Demo' },
};

// ─── Toolkit exports (drop-in for @contentful/react-apps-toolkit) ────────────

export const useSDK = () => sdk;
export const useCMA = () => cma;
export const useAutoResizer = () => {};
export const useFieldValue = () => [undefined, async () => {}];
export const SDKProvider = ({ children }: { children: ReactNode }) => <>{children}</>;
