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
  const contentTypes: Array<{ sys: { id: string }; name: string }> = ctRes.items;

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

  const { data: rows, isLoading } = useQuery({
    queryKey: ['taxonomy-coverage'],
    queryFn: () => fetchTaxonomyCoverage(sdk),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <Flex justifyContent="center" paddingTop="spacingXl"><Spinner /></Flex>;
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

  return (
    <Flex flexDirection="column" gap="spacingM">
      <Flex justifyContent="space-between" alignItems="center">
        <Flex flexDirection="column">
          <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">Taxonomy Coverage</Text>
          <Text fontColor="gray600">% of entries with at least one concept assigned, per content type.</Text>
        </Flex>
        <Card padding="default" style={{ textAlign: 'center', minWidth: 120 }}>
          <Text fontColor="gray600" fontSize="fontSizeS">Overall</Text>
          <Text
            fontSize="fontSizeXl"
            fontWeight="fontWeightDemiBold"
            as="p"
            style={{ color: overallPct >= 75 ? '#00C459' : overallPct >= 50 ? '#F0AB00' : '#E44F20' }}
          >
            {overallPct}%
          </Text>
        </Card>
      </Flex>

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
