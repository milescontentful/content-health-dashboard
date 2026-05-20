import { useSDK } from '@contentful/react-apps-toolkit';
import { useQuery } from '@tanstack/react-query';
import {
  Flex,
  Text,
  Spinner,
  Note,
  Table,
  Badge,
  Card,
  Button,
} from '@contentful/f36-components';

function SimpleProgress({ value }: { value: number }) {
  return (
    <div style={{ height: 6, background: '#e5e9ed', borderRadius: 3, overflow: 'hidden', flex: 1 }}>
      <div style={{ width: `${Math.min(100, value)}%`, height: '100%', background: value >= 75 ? '#00C459' : value >= 50 ? '#F0AB00' : '#E44F20', borderRadius: 3 }} />
    </div>
  );
}

interface CoverageRow {
  contentTypeId: string;
  contentTypeName: string;
  total: number;
  withConcepts: number;
  pct: number;
}

async function fetchTaxonomyCoverage(sdk: ReturnType<typeof useSDK>): Promise<CoverageRow[]> {
  const ctRes = await (sdk.cma as any).contentType.getMany({ query: { limit: 200 } });
  const contentTypes: Array<{ sys: { id: string }; name: string }> = (ctRes.items as Array<{ sys: { id: string }; name: string }>)
    .sort((a, b) => a.name.localeCompare(b.name));

  const rows: CoverageRow[] = [];

  for (const ct of contentTypes) {
    const res = await (sdk.cma as any).entry.getMany({
      query: { content_type: ct.sys.id, limit: 200 },
    });

    const total: number = res.total ?? res.items.length;
    const withConcepts = res.items.filter(
      (e: any) =>
        Array.isArray(e.metadata?.concepts) && e.metadata.concepts.length > 0,
    ).length;

    if (total === 0) continue;

    rows.push({
      contentTypeId: ct.sys.id,
      contentTypeName: ct.name,
      total,
      withConcepts,
      pct: Math.round((withConcepts / Math.min(total, res.items.length)) * 100),
    });
  }

  return rows.sort((a, b) => a.pct - b.pct);
}

export function TaxonomyCoverage() {
  const sdk = useSDK();

  const { data: rows, isLoading, refetch } = useQuery({
    queryKey: ['taxonomy-coverage'],
    queryFn: () => fetchTaxonomyCoverage(sdk),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Flex flexDirection="column" gap="spacingM">
        <Flex justifyContent="space-between" alignItems="flex-start">
          <Flex flexDirection="column" gap="spacingXs">
            <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">Taxonomy Coverage</Text>
            <Text fontColor="gray600" fontSize="fontSizeS">Concept assignment coverage per content type — pairs with your Taxonomy Viewer app.</Text>
          </Flex>
        </Flex>
        <Note variant="neutral">
          <Flex gap="spacingS" alignItems="center">
            <Spinner />
            <Flex flexDirection="column" gap="spacing2Xs">
              <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeS">Loading taxonomy data…</Text>
              <Text fontColor="gray500" fontSize="fontSizeS">
                Sampling entries across all content types. This may take 10–30 seconds for large spaces — please stay on this tab.
              </Text>
            </Flex>
          </Flex>
        </Note>
      </Flex>
    );
  }
  if (!rows) return <Note variant="negative">Could not load taxonomy data.</Note>;

  if (rows.length === 0) {
    return (
      <Note variant="neutral">
        No content types with entries found. Make sure you have published entries and taxonomy concepts configured.
      </Note>
    );
  }

  const overallPct = Math.round(
    rows.reduce((sum, r) => sum + r.pct, 0) / rows.length,
  );
  const totalTagged = rows.reduce((s, r) => s + r.withConcepts, 0);
  const totalEntries = rows.reduce((s, r) => s + r.total, 0);

  return (
    <Flex flexDirection="column" gap="spacingM">
      <Flex justifyContent="space-between" alignItems="flex-start">
        <Flex flexDirection="column" gap="spacingXs">
          <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">Taxonomy Coverage</Text>
          <Text fontColor="gray600" fontSize="fontSizeS">Concept assignment coverage per content type — pairs with your Taxonomy Viewer app.</Text>
        </Flex>
        <Button variant="secondary" size="small" onClick={() => refetch()}>Refresh</Button>
      </Flex>

      {/* Summary strip */}
      <Card padding="default">
        <Flex gap="spacingXl" flexWrap="wrap" alignItems="flex-start">
          <Flex flexDirection="column" gap="spacingXs">
            <Text fontColor="gray500" fontSize="fontSizeS">Overall coverage</Text>
            <Text
              fontWeight="fontWeightDemiBold"
              fontSize="fontSizeXl"
              style={{ color: overallPct >= 75 ? '#00C459' : overallPct >= 50 ? '#F0AB00' : '#E44F20' }}
            >
              {overallPct}%
            </Text>
          </Flex>
          <Flex flexDirection="column" gap="spacingXs">
            <Text fontColor="gray500" fontSize="fontSizeS">Content types</Text>
            <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeXl">{rows.length}</Text>
          </Flex>
          <Flex flexDirection="column" gap="spacingXs">
            <Text fontColor="gray500" fontSize="fontSizeS">Entries tagged</Text>
            <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeXl">{totalTagged}</Text>
          </Flex>
          <Flex flexDirection="column" gap="spacingXs">
            <Text fontColor="gray500" fontSize="fontSizeS">Entries sampled</Text>
            <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeXl">{totalEntries}</Text>
          </Flex>
        </Flex>
      </Card>

      <Table>
        <Table.Head>
          <Table.Row>
            <Table.Cell>Content type</Table.Cell>
            <Table.Cell>Tagged</Table.Cell>
            <Table.Cell>Total (sampled)</Table.Cell>
            <Table.Cell style={{ minWidth: 160 }}>Coverage</Table.Cell>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          {rows.map((row) => (
            <Table.Row key={row.contentTypeId}>
              <Table.Cell>{row.contentTypeName}</Table.Cell>
              <Table.Cell>{row.withConcepts}</Table.Cell>
              <Table.Cell>
                {row.total > 200 ? `200 of ${row.total}` : row.total}
              </Table.Cell>
              <Table.Cell>
                <Flex gap="spacingS" alignItems="center">
                  <SimpleProgress value={row.pct} />
                  <Badge variant={row.pct >= 75 ? 'positive' : row.pct >= 50 ? 'warning' : 'negative'}>
                    {row.pct}%
                  </Badge>
                </Flex>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>

      <Note variant="neutral">
        Coverage is based on up to 200 entries per content type. Entries must have <strong>concepts</strong> assigned via <code>sys.metadata.concepts</code> (set through Contentful&apos;s Taxonomy Manager or programmatically).
      </Note>
    </Flex>
  );
}
