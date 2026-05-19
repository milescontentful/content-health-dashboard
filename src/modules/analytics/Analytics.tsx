/**
 * Analytics module — two sections:
 *
 * 1. Content Velocity (CMA-derived, works today in any space)
 *    - Publishing rate by day over the last 30 days
 *    - Most active publishers
 *    - Top-published content types
 *    - Draft → Published cycle time estimate
 *
 * 2. Contentful Analytics (placeholder)
 *    - Contentful Analytics is currently in limited availability.
 *    - When the public API ships, this section will show page views,
 *      engagement time, and content performance data.
 *    - Add your Analytics API key in Config Screen → Analytics to enable it.
 *
 * Docs: https://www.contentful.com/blog/introducing-contentful-analytics/
 */
import { useSDK } from '@contentful/react-apps-toolkit';
import { useQuery } from '@tanstack/react-query';
import {
  Flex,
  Text,
  Spinner,
  Note,
  Badge,
  Table,
  Card,
  Button,
  Tabs,
} from '@contentful/f36-components';
import { DownloadSimpleIcon } from '@contentful/f36-icons';
import { downloadCsv, formatDateForCsv } from '../../lib/csv';
import type { ModuleProps } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DailyCount { date: string; count: number }
interface PublisherStat { id: string; name: string; count: number }
interface ContentTypeStat { id: string; name: string; published: number; draft: number; total: number }

interface VelocityData {
  dailyCounts: DailyCount[];
  publishers: PublisherStat[];
  contentTypes: ContentTypeStat[];
  totalPublishedLast30: number;
  avgPerDay: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function MiniSparkline({ data, max }: { data: number[]; max: number }) {
  const w = 120, h = 32, pad = 2;
  if (!data.length || max === 0) return null;
  const pts = data.map((v, i) => {
    const x = pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2);
    const y = h - pad - (v / max) * (h - pad * 2);
    return `${x},${y}`;
  });
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline fill="none" stroke="#1773EB" strokeWidth="1.5" points={pts.join(' ')} />
    </svg>
  );
}

// ─── Data fetcher ─────────────────────────────────────────────────────────────

async function fetchVelocity(sdk: ReturnType<typeof useSDK>): Promise<VelocityData> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [recentRes, ctRes] = await Promise.all([
    (sdk.cma as any).entry.getMany({
      query: { 'sys.publishedAt[gte]': thirtyDaysAgo, limit: 200, order: '-sys.publishedAt' },
    }),
    (sdk.cma as any).contentType.getMany({ query: { limit: 200 } }),
  ]);

  const entries: any[] = recentRes.items;
  const contentTypes: any[] = ctRes.items;
  const ctNameMap: Record<string, string> = {};
  for (const ct of contentTypes) ctNameMap[ct.sys.id] = ct.name;

  // Daily publish counts (last 30 days)
  const dailyMap: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    dailyMap[d.toISOString().slice(0, 10)] = 0;
  }
  for (const e of entries) {
    const day = e.sys.publishedAt?.slice(0, 10);
    if (day && day in dailyMap) dailyMap[day]++;
  }
  const dailyCounts: DailyCount[] = Object.entries(dailyMap).map(([date, count]) => ({ date, count }));

  // Publisher stats (by createdBy user ID)
  const publisherMap: Record<string, number> = {};
  for (const e of entries) {
    const uid = e.sys.createdBy?.sys?.id ?? 'unknown';
    publisherMap[uid] = (publisherMap[uid] ?? 0) + 1;
  }
  const publishers: PublisherStat[] = Object.entries(publisherMap)
    .map(([id, count]) => ({ id, name: id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Content type stats
  const ctMap: Record<string, ContentTypeStat> = {};
  for (const ct of contentTypes) {
    ctMap[ct.sys.id] = { id: ct.sys.id, name: ct.name, published: 0, draft: 0, total: 0 };
  }
  for (const e of entries) {
    const ctId = e.sys.contentType?.sys?.id;
    if (ctId && ctMap[ctId]) ctMap[ctId].published++;
  }

  // Get total counts per CT (sample top 10 by published activity)
  const activeCtIds = Object.values(ctMap)
    .filter((c) => c.published > 0)
    .sort((a, b) => b.published - a.published)
    .slice(0, 10)
    .map((c) => c.id);

  for (const ctId of activeCtIds) {
    try {
      const totalRes = await (sdk.cma as any).entry.getMany({ query: { content_type: ctId, limit: 1 } });
      if (ctMap[ctId]) ctMap[ctId].total = totalRes.total;
    } catch { /* skip */ }
  }

  const contentTypeStats = Object.values(ctMap)
    .filter((c) => c.published > 0)
    .sort((a, b) => b.published - a.published);

  const totalPublished = dailyCounts.reduce((s, d) => s + d.count, 0);

  return {
    dailyCounts,
    publishers,
    contentTypes: contentTypeStats,
    totalPublishedLast30: totalPublished,
    avgPerDay: Math.round((totalPublished / 30) * 10) / 10,
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Analytics({ installationParams }: ModuleProps) {
  const sdk = useSDK();
  const analyticsApiKey = (installationParams as any).analyticsApiKey ?? '';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['analytics-velocity'],
    queryFn: () => fetchVelocity(sdk),
    staleTime: 10 * 60 * 1000,
  });

  const maxDaily = data ? Math.max(...data.dailyCounts.map((d) => d.count), 1) : 1;

  const handleExportVelocity = () => {
    if (!data) return;
    const headers = ['Date', 'Published Entries'];
    const rows = data.dailyCounts.map((d) => [d.date, d.count]);
    downloadCsv(`publishing-velocity-${formatDateForCsv(new Date()).replace(/[ :]/g, '-')}.csv`, headers, rows);
  };

  return (
    <Flex flexDirection="column" gap="spacingM">
      <Flex justifyContent="space-between" alignItems="flex-start">
        <Flex flexDirection="column" gap="spacingXs">
          <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">Analytics</Text>
          <Text fontColor="gray600" fontSize="fontSizeS">
            Content velocity from live CMA data · Contentful Analytics integration coming soon.
          </Text>
        </Flex>
        <Button variant="secondary" size="small" onClick={() => refetch()}>
          Refresh
        </Button>
      </Flex>

      {isLoading && (
        <Flex gap="spacingS" alignItems="center" paddingTop="spacingL">
          <Spinner />
          <Text fontColor="gray500" fontSize="fontSizeS">Loading publishing data…</Text>
        </Flex>
      )}

      {error && <Note variant="negative">Failed to load publishing data.</Note>}

      {data && !isLoading && (
        <Tabs defaultTab="velocity">
          <Tabs.List>
            <Tabs.Tab panelId="velocity">Content velocity</Tabs.Tab>
            <Tabs.Tab panelId="types">By content type</Tabs.Tab>
            <Tabs.Tab panelId="contentful-analytics">Contentful Analytics</Tabs.Tab>
          </Tabs.List>

          {/* Velocity tab */}
          <Tabs.Panel id="velocity">
            {/* Summary strip */}
            <Card padding="default" style={{ marginBottom: 16 }}>
              <Flex gap="spacingXl" flexWrap="wrap" alignItems="flex-start">
                <Flex flexDirection="column" gap="spacingXs">
                  <Text fontColor="gray500" fontSize="fontSizeS">Published (last 30 days)</Text>
                  <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeXl">{data.totalPublishedLast30}</Text>
                </Flex>
                <Flex flexDirection="column" gap="spacingXs">
                  <Text fontColor="gray500" fontSize="fontSizeS">Avg per day</Text>
                  <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeXl">{data.avgPerDay}</Text>
                </Flex>
                <Flex flexDirection="column" gap="spacingXs">
                  <Text fontColor="gray500" fontSize="fontSizeS">Active publishers</Text>
                  <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeXl">{data.publishers.length}</Text>
                </Flex>
                <Flex flexDirection="column" gap="spacingXs" style={{ flex: 1, minWidth: 140 }}>
                  <Text fontColor="gray500" fontSize="fontSizeS">Trend (30 days)</Text>
                  <MiniSparkline data={data.dailyCounts.map((d) => d.count)} max={maxDaily} />
                </Flex>
              </Flex>
            </Card>

            {/* Daily table */}
            <Flex justifyContent="space-between" alignItems="center" marginBottom="spacingS">
              <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeS">Daily publishing activity</Text>
              <Button variant="secondary" size="small" startIcon={<DownloadSimpleIcon />} onClick={handleExportVelocity}>
                Export CSV
              </Button>
            </Flex>

            <Table>
              <Table.Head>
                <Table.Row>
                  <Table.Cell>Date</Table.Cell>
                  <Table.Cell>Entries published</Table.Cell>
                  <Table.Cell style={{ minWidth: 200 }}>Activity</Table.Cell>
                </Table.Row>
              </Table.Head>
              <Table.Body>
                {[...data.dailyCounts].reverse().filter((d) => d.count > 0).slice(0, 30).map((d) => (
                  <Table.Row key={d.date}>
                    <Table.Cell>{formatDay(d.date)}</Table.Cell>
                    <Table.Cell>
                      <Badge variant={d.count > data.avgPerDay * 1.5 ? 'positive' : 'secondary'}>{d.count}</Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <div style={{ height: 8, background: '#e5e9ed', borderRadius: 4, overflow: 'hidden', width: '100%' }}>
                        <div style={{ width: `${(d.count / maxDaily) * 100}%`, height: '100%', background: '#1773EB', borderRadius: 4 }} />
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
                {data.dailyCounts.every((d) => d.count === 0) && (
                  <Table.Row>
                    <Table.Cell colSpan={3}>
                      <Note variant="neutral">No entries published in the last 30 days.</Note>
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table>
          </Tabs.Panel>

          {/* By content type */}
          <Tabs.Panel id="types">
            {data.contentTypes.length === 0 ? (
              <Note variant="neutral">No entries published in the last 30 days.</Note>
            ) : (
              <Table>
                <Table.Head>
                  <Table.Row>
                    <Table.Cell>Content type</Table.Cell>
                    <Table.Cell>Published (30d)</Table.Cell>
                    <Table.Cell>Total entries</Table.Cell>
                    <Table.Cell style={{ minWidth: 160 }}>Share of activity</Table.Cell>
                  </Table.Row>
                </Table.Head>
                <Table.Body>
                  {data.contentTypes.map((ct) => {
                    const maxPub = Math.max(...data.contentTypes.map((c) => c.published), 1);
                    const pct = Math.round((ct.published / maxPub) * 100);
                    return (
                      <Table.Row key={ct.id}>
                        <Table.Cell>
                          <Text fontWeight="fontWeightDemiBold">{ct.name}</Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Badge variant="secondary">{ct.published}</Badge>
                        </Table.Cell>
                        <Table.Cell>
                          <Text fontColor="gray500">{ct.total || '—'}</Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Flex alignItems="center" gap="spacingXs">
                            <div style={{ flex: 1, height: 6, background: '#e5e9ed', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: '#1773EB', borderRadius: 3 }} />
                            </div>
                            <Text fontSize="fontSizeS" style={{ width: 36, textAlign: 'right' }}>{pct}%</Text>
                          </Flex>
                        </Table.Cell>
                      </Table.Row>
                    );
                  })}
                </Table.Body>
              </Table>
            )}
          </Tabs.Panel>

          {/* Contentful Analytics placeholder */}
          <Tabs.Panel id="contentful-analytics">
            <Flex flexDirection="column" gap="spacingL">
              <Note variant="neutral">
                <Flex flexDirection="column" gap="spacingS">
                  <Text fontWeight="fontWeightDemiBold">Contentful Analytics — coming soon</Text>
                  <Text fontSize="fontSizeS">
                    Contentful Analytics provides page views, time on page, bounce rate, and content performance data
                    natively within your Contentful space. It is currently in limited availability.
                  </Text>
                  <Text fontSize="fontSizeS">
                    Once the API is generally available, this tab will show:
                  </Text>
                  <Flex flexDirection="column" gap="spacingXs" style={{ paddingLeft: 12 }}>
                    {[
                      'Top-performing entries by page views',
                      'Average engagement time per content type',
                      'Traffic sources and referrers',
                      'Content funnel and conversion paths',
                      'A/B test results correlated with Ninetailed experiences',
                    ].map((item) => (
                      <Text key={item} fontSize="fontSizeS">• {item}</Text>
                    ))}
                  </Flex>
                  <Text fontSize="fontSizeS">
                    <a href="https://www.contentful.com/blog/introducing-contentful-analytics/" target="_blank" rel="noopener noreferrer" style={{ color: '#1773EB' }}>
                      Learn about Contentful Analytics →
                    </a>
                  </Text>
                </Flex>
              </Note>

              {/* Placeholder cards */}
              <Flex gap="spacingM" flexWrap="wrap">
                {[
                  { label: 'Page views (30d)', value: '—', note: 'Requires Analytics API' },
                  { label: 'Avg engagement time', value: '—', note: 'Requires Analytics API' },
                  { label: 'Top entry', value: '—', note: 'Requires Analytics API' },
                  { label: 'Conversion rate', value: '—', note: 'Requires Analytics API' },
                ].map((card) => (
                  <Card key={card.label} padding="default" style={{ flex: 1, minWidth: 160, opacity: 0.6 }}>
                    <Text fontColor="gray500" fontSize="fontSizeS">{card.label}</Text>
                    <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeXl" style={{ filter: 'blur(4px)', userSelect: 'none' }}>
                      1,234
                    </Text>
                    <Badge variant="secondary" style={{ marginTop: 4 }}>{card.note}</Badge>
                  </Card>
                ))}
              </Flex>

              {analyticsApiKey ? (
                <Note variant="positive">Analytics API key configured — ready to connect when the API ships.</Note>
              ) : (
                <Note variant="neutral" style={{ fontSize: 12 }}>
                  Add your Analytics API key in <strong>Config Screen → Analytics</strong> to be ready when the API launches.
                </Note>
              )}
            </Flex>
          </Tabs.Panel>
        </Tabs>
      )}
    </Flex>
  );
}
