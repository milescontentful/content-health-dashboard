import { useState } from 'react';
import { useSDK } from '@contentful/react-apps-toolkit';
import { useQuery } from '@tanstack/react-query';
import {
  Flex,
  Text,
  Spinner,
  Note,
  Badge,
  Table,
  Tabs,
  Card,
  Button,
  TextLink,
} from '@contentful/f36-components';
import { DownloadSimpleIcon, WarningIcon } from '@contentful/f36-icons';
import { downloadCsv, formatDateForCsv } from '../../lib/csv';

interface EntryRef {
  entryId: string;
  entryTitle: string;
  contentType: string;
  fieldId: string;
  refId: string;
  refType: 'Entry' | 'Asset';
}

interface OrphanedEntry {
  id: string;
  title: string;
  contentType: string;
  updatedAt: string;
  status: 'Draft' | 'Published' | 'Changed';
}

interface HighRiskEntry {
  id: string;
  title: string;
  contentType: string;
  inboundCount: number;
  status: 'Draft' | 'Published' | 'Changed';
}

function entryStatus(entry: any): 'Draft' | 'Published' | 'Changed' {
  if (!entry.sys.publishedAt) return 'Draft';
  if (entry.sys.updatedAt > entry.sys.publishedAt) return 'Changed';
  return 'Published';
}

function statusVariant(status: string): 'positive' | 'warning' | 'secondary' {
  if (status === 'Published') return 'positive';
  if (status === 'Changed') return 'warning';
  return 'secondary';
}

async function analyseReferences(sdk: ReturnType<typeof useSDK>) {
  // Fetch all entries in batches
  const allEntries: any[] = [];
  let skip = 0;
  const limit = 200;
  let total = Infinity;
  while (skip < total) {
    const res = await (sdk.cma as any).entry.getMany({ query: { limit, skip } });
    total = res.total;
    allEntries.push(...res.items);
    skip += limit;
    if (res.items.length === 0) break;
  }

  // Fetch all published assets (to detect broken asset refs)
  const assetsRes = await (sdk.cma as any).asset.getMany({ query: { limit: 1000 } });
  const allAssetIds = new Set<string>(assetsRes.items.map((a: any) => a.sys.id));
  const allEntryIds = new Set<string>(allEntries.map((e: any) => e.sys.id));

  const localesRes = await (sdk.cma as any).locale.getMany({});
  const defaultLocale: string = localesRes.items.find((l: any) => l.default)?.code ?? 'en-US';

  // Build inbound reference map: refId → list of source entry IDs
  const inboundMap = new Map<string, string[]>();
  const brokenRefs: EntryRef[] = [];

  for (const entry of allEntries) {
    const firstFieldVal = Object.values(entry.fields)[0] as any;
    const entryTitle = firstFieldVal ? String(Object.values(firstFieldVal)[0] ?? entry.sys.id) : entry.sys.id;
    const contentType = entry.sys.contentType?.sys?.id ?? '';

    for (const [fieldId, fieldVal] of Object.entries(entry.fields) as [string, any][]) {
      const value = fieldVal?.[defaultLocale];
      if (!value) continue;

      const refs: { id: string; type: 'Entry' | 'Asset' }[] = [];

      if (value?.sys?.type === 'Link') {
        refs.push({ id: value.sys.id, type: value.sys.linkType as 'Entry' | 'Asset' });
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          if (item?.sys?.type === 'Link') {
            refs.push({ id: item.sys.id, type: item.sys.linkType as 'Entry' | 'Asset' });
          }
        }
      }

      // Rich text node refs
      if (value?.nodeType === 'document') {
        const extractRefs = (node: any) => {
          if (node?.data?.target?.sys?.type === 'Link') {
            refs.push({ id: node.data.target.sys.id, type: node.data.target.sys.linkType as 'Entry' | 'Asset' });
          }
          if (node.content) node.content.forEach(extractRefs);
        };
        extractRefs(value);
      }

      for (const ref of refs) {
        // Track inbound refs for high-risk analysis (entries only)
        if (ref.type === 'Entry') {
          const existing = inboundMap.get(ref.id) ?? [];
          existing.push(entry.sys.id);
          inboundMap.set(ref.id, existing);
        }

        // Detect broken refs
        const exists = ref.type === 'Entry' ? allEntryIds.has(ref.id) : allAssetIds.has(ref.id);
        if (!exists) {
          brokenRefs.push({
            entryId: entry.sys.id,
            entryTitle,
            contentType,
            fieldId,
            refId: ref.id,
            refType: ref.type,
          });
        }
      }
    }
  }

  // Orphaned entries: entries not referenced by any other entry
  const orphanedEntries: OrphanedEntry[] = allEntries
    .filter((e: any) => !inboundMap.has(e.sys.id))
    .map((e: any) => {
      const firstFieldVal = Object.values(e.fields)[0] as any;
      return {
        id: e.sys.id,
        title: firstFieldVal ? String(Object.values(firstFieldVal)[0] ?? e.sys.id) : e.sys.id,
        contentType: e.sys.contentType?.sys?.id ?? '',
        updatedAt: e.sys.updatedAt,
        status: entryStatus(e),
      };
    });

  // High-risk entries: entries referenced by many others (high blast radius)
  const highRisk: HighRiskEntry[] = allEntries
    .map((e: any) => {
      const count = inboundMap.get(e.sys.id)?.length ?? 0;
      if (count < 5) return null;
      const firstFieldVal = Object.values(e.fields)[0] as any;
      return {
        id: e.sys.id,
        title: firstFieldVal ? String(Object.values(firstFieldVal)[0] ?? e.sys.id) : e.sys.id,
        contentType: e.sys.contentType?.sys?.id ?? '',
        inboundCount: count,
        status: entryStatus(e),
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.inboundCount - a.inboundCount) as HighRiskEntry[];

  return { brokenRefs, orphanedEntries, highRisk, totalEntries: allEntries.length };
}

export function ReferenceRisk() {
  const sdk = useSDK();
  const [activeTab, setActiveTab] = useState('broken');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reference-risk'],
    queryFn: () => analyseReferences(sdk),
    staleTime: 5 * 60 * 1000,
  });

  const handleExportBroken = () => {
    if (!data) return;
    const headers = ['Source Entry ID', 'Source Title', 'Content Type', 'Field', 'Missing Ref ID', 'Ref Type'];
    const rows = data.brokenRefs.map((r) => [r.entryId, r.entryTitle, r.contentType, r.fieldId, r.refId, r.refType]);
    downloadCsv(`broken-refs-${formatDateForCsv(new Date()).replace(/[ :]/g, '-')}.csv`, headers, rows);
  };

  const handleExportOrphans = () => {
    if (!data) return;
    const headers = ['Entry ID', 'Title', 'Content Type', 'Status', 'Updated'];
    const rows = data.orphanedEntries.map((e) => [e.id, e.title, e.contentType, e.status, formatDateForCsv(e.updatedAt)]);
    downloadCsv(`orphaned-entries-${formatDateForCsv(new Date()).replace(/[ :]/g, '-')}.csv`, headers, rows);
  };

  const handleExportHighRisk = () => {
    if (!data) return;
    const headers = ['Entry ID', 'Title', 'Content Type', 'Inbound References', 'Status'];
    const rows = data.highRisk.map((e) => [e.id, e.title, e.contentType, e.inboundCount, e.status]);
    downloadCsv(`high-risk-entries-${formatDateForCsv(new Date()).replace(/[ :]/g, '-')}.csv`, headers, rows);
  };

  return (
    <Flex flexDirection="column" gap="spacingM">
      <Flex justifyContent="space-between" alignItems="flex-start">
        <Flex flexDirection="column" gap="spacingXs">
          <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">Reference Risk</Text>
          <Text fontColor="gray600" fontSize="fontSizeS">
            Identify broken links, unreferenced entries, and high blast-radius content.
          </Text>
        </Flex>
        <Button variant="secondary" size="small" onClick={() => refetch()}>
          Refresh
        </Button>
      </Flex>

      {isLoading && (
        <Flex flexDirection="column" alignItems="flex-start" gap="spacingS" paddingTop="spacingL">
          <Spinner />
          <Text fontColor="gray500" fontSize="fontSizeS">Analysing all entries — this may take a moment for large spaces…</Text>
        </Flex>
      )}

      {error && <Note variant="negative">Failed to load reference data. Check CMA permissions.</Note>}

      {data && !isLoading && (
        <>
          {/* Summary strip */}
          <Card padding="default">
            <Flex gap="spacingXl" flexWrap="wrap" alignItems="flex-start">
              <Flex flexDirection="column" gap="spacingXs">
                <Text fontColor="gray500" fontSize="fontSizeS">Total entries</Text>
                <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeXl">{data.totalEntries}</Text>
              </Flex>
              <Flex flexDirection="column" gap="spacingXs">
                <Text fontColor="gray500" fontSize="fontSizeS">Broken refs</Text>
                <Badge variant={data.brokenRefs.length > 0 ? 'negative' : 'positive'} style={{ fontSize: 16, fontWeight: 700, padding: '2px 8px' }}>
                  {data.brokenRefs.length}
                </Badge>
              </Flex>
              <Flex flexDirection="column" gap="spacingXs">
                <Text fontColor="gray500" fontSize="fontSizeS">Orphaned entries</Text>
                <Badge variant={data.orphanedEntries.length > 20 ? 'warning' : 'secondary'} style={{ fontSize: 16, fontWeight: 700, padding: '2px 8px' }}>
                  {data.orphanedEntries.length}
                </Badge>
              </Flex>
              <Flex flexDirection="column" gap="spacingXs">
                <Text fontColor="gray500" fontSize="fontSizeS">High-risk entries (5+ refs)</Text>
                <Badge variant={data.highRisk.length > 0 ? 'warning' : 'positive'} style={{ fontSize: 16, fontWeight: 700, padding: '2px 8px' }}>
                  {data.highRisk.length}
                </Badge>
              </Flex>
            </Flex>
          </Card>

          <Tabs currentTab={activeTab} onTabChange={setActiveTab}>
            <Tabs.List>
              <Tabs.Tab panelId="broken">
                Broken refs ({data.brokenRefs.length})
              </Tabs.Tab>
              <Tabs.Tab panelId="orphans">
                Orphaned entries ({data.orphanedEntries.length})
              </Tabs.Tab>
              <Tabs.Tab panelId="high-risk">
                High-risk ({data.highRisk.length})
              </Tabs.Tab>
            </Tabs.List>

            {/* Broken references */}
            <Tabs.Panel id="broken">
              {data.brokenRefs.length > 0 && (
                <Flex justifyContent="space-between" alignItems="center" marginBottom="spacingS">
                  <Flex gap="spacingXs" alignItems="center">
                    <WarningIcon size="small" style={{ color: '#E44F20' }} />
                    <Text fontSize="fontSizeS" fontColor="gray600">
                      These entries reference IDs that no longer exist.
                    </Text>
                  </Flex>
                  <Button variant="secondary" size="small" startIcon={<DownloadSimpleIcon />} onClick={handleExportBroken}>
                    Export CSV
                  </Button>
                </Flex>
              )}
              {data.brokenRefs.length === 0 ? (
                <Note variant="positive">No broken references found — all links are intact.</Note>
              ) : (
                <Table>
                  <Table.Head>
                    <Table.Row>
                      <Table.Cell>Source Entry</Table.Cell>
                      <Table.Cell>Content Type</Table.Cell>
                      <Table.Cell>Field</Table.Cell>
                      <Table.Cell>Missing ID</Table.Cell>
                      <Table.Cell>Type</Table.Cell>
                    </Table.Row>
                  </Table.Head>
                  <Table.Body>
                    {data.brokenRefs.map((ref, i) => (
                      <Table.Row key={i}>
                        <Table.Cell>
                          <TextLink
                            as="button"
                            onClick={() => (sdk as any).navigator?.openEntry(ref.entryId, { slideIn: true })}
                          >
                            {ref.entryTitle}
                          </TextLink>
                        </Table.Cell>
                        <Table.Cell>
                          <Text fontColor="gray500" fontSize="fontSizeS">{ref.contentType}</Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Badge variant="secondary">{ref.fieldId}</Badge>
                        </Table.Cell>
                        <Table.Cell>
                          <Text fontColor="gray500" fontSize="fontSizeS" style={{ fontFamily: 'monospace' }}>
                            {ref.refId}
                          </Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Badge variant="negative">{ref.refType}</Badge>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              )}
            </Tabs.Panel>

            {/* Orphaned entries */}
            <Tabs.Panel id="orphans">
              <Flex justifyContent="space-between" alignItems="center" marginBottom="spacingS">
                <Text fontSize="fontSizeS" fontColor="gray600">
                  Entries not referenced by any other entry. May be stand-alone pages or unused content.
                </Text>
                {data.orphanedEntries.length > 0 && (
                  <Button variant="secondary" size="small" startIcon={<DownloadSimpleIcon />} onClick={handleExportOrphans}>
                    Export CSV
                  </Button>
                )}
              </Flex>
              {data.orphanedEntries.length === 0 ? (
                <Note variant="positive">All entries are referenced by at least one other entry.</Note>
              ) : (
                <Table>
                  <Table.Head>
                    <Table.Row>
                      <Table.Cell>Entry</Table.Cell>
                      <Table.Cell>Content Type</Table.Cell>
                      <Table.Cell>Status</Table.Cell>
                      <Table.Cell>Last Updated</Table.Cell>
                    </Table.Row>
                  </Table.Head>
                  <Table.Body>
                    {data.orphanedEntries.slice(0, 100).map((entry) => (
                      <Table.Row key={entry.id}>
                        <Table.Cell>
                          <TextLink
                            as="button"
                            onClick={() => (sdk as any).navigator?.openEntry(entry.id, { slideIn: true })}
                          >
                            {entry.title}
                          </TextLink>
                        </Table.Cell>
                        <Table.Cell>
                          <Text fontColor="gray500" fontSize="fontSizeS">{entry.contentType}</Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Badge variant={statusVariant(entry.status)}>{entry.status}</Badge>
                        </Table.Cell>
                        <Table.Cell>
                          <Text fontColor="gray500" fontSize="fontSizeS">
                            {new Date(entry.updatedAt).toLocaleDateString()}
                          </Text>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              )}
              {data.orphanedEntries.length > 100 && (
                <Note variant="neutral" style={{ marginTop: 8 }}>
                  Showing first 100. Export CSV to see all {data.orphanedEntries.length}.
                </Note>
              )}
            </Tabs.Panel>

            {/* High-risk entries */}
            <Tabs.Panel id="high-risk">
              <Flex justifyContent="space-between" alignItems="center" marginBottom="spacingS">
                <Text fontSize="fontSizeS" fontColor="gray600">
                  Entries referenced by 5 or more others — changes here have high blast radius.
                </Text>
                {data.highRisk.length > 0 && (
                  <Button variant="secondary" size="small" startIcon={<DownloadSimpleIcon />} onClick={handleExportHighRisk}>
                    Export CSV
                  </Button>
                )}
              </Flex>
              {data.highRisk.length === 0 ? (
                <Note variant="positive">No entries with 5 or more inbound references found.</Note>
              ) : (
                <Table>
                  <Table.Head>
                    <Table.Row>
                      <Table.Cell>Entry</Table.Cell>
                      <Table.Cell>Content Type</Table.Cell>
                      <Table.Cell>Inbound refs</Table.Cell>
                      <Table.Cell>Status</Table.Cell>
                    </Table.Row>
                  </Table.Head>
                  <Table.Body>
                    {data.highRisk.map((entry) => (
                      <Table.Row key={entry.id}>
                        <Table.Cell>
                          <TextLink
                            as="button"
                            onClick={() => (sdk as any).navigator?.openEntry(entry.id, { slideIn: true })}
                          >
                            {entry.title}
                          </TextLink>
                        </Table.Cell>
                        <Table.Cell>
                          <Text fontColor="gray500" fontSize="fontSizeS">{entry.contentType}</Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Badge variant={entry.inboundCount >= 20 ? 'negative' : 'warning'}>
                            {entry.inboundCount}
                          </Badge>
                        </Table.Cell>
                        <Table.Cell>
                          <Badge variant={statusVariant(entry.status)}>{entry.status}</Badge>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              )}
            </Tabs.Panel>
          </Tabs>
        </>
      )}
    </Flex>
  );
}
