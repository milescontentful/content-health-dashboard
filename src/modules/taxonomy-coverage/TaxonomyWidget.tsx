import { useSDK } from '@contentful/react-apps-toolkit';
import { useQuery } from '@tanstack/react-query';
import { Flex, Text, Card, Badge, Spinner, TextLink } from '@contentful/f36-components';
import type { HomeWidgetProps } from '../types';

export function TaxonomyWidget({ onNavigate }: HomeWidgetProps) {
  const sdk = useSDK();

  const { data, isLoading } = useQuery({
    queryKey: ['taxonomy-widget'],
    queryFn: async () => {
      const ctRes = await (sdk.cma as any).contentType.getMany({ query: { limit: 200 } });
      const contentTypes = ctRes.items as Array<{ sys: { id: string }; name: string; fields: any[] }>;

      let withConcepts = 0;
      let totalEntries = 0;
      let taggedEntries = 0;

      for (const ct of contentTypes.slice(0, 10)) {
        const hasTaxField = ct.fields.some((f: any) =>
          f.type === 'Link' && f.linkType === 'Entry' &&
          (f.id.toLowerCase().includes('tax') || f.id.toLowerCase().includes('concept') || f.id.toLowerCase().includes('tag') || f.id.toLowerCase().includes('categor'))
        );
        if (hasTaxField) withConcepts++;

        const res = await (sdk.cma as any).entry.getMany({ query: { content_type: ct.sys.id, limit: 1 } });
        totalEntries += res.total;
        if (hasTaxField) taggedEntries += res.total;
      }

      const pct = totalEntries > 0 ? Math.round((taggedEntries / totalEntries) * 100) : 0;
      return { withConcepts, totalCt: contentTypes.length, pct };
    },
    staleTime: 15 * 60 * 1000,
  });

  return (
    <Card padding="default">
      <Flex flexDirection="column" gap="spacingS">
        <Flex justifyContent="space-between" alignItems="center">
          <Text fontWeight="fontWeightDemiBold">Taxonomy Coverage</Text>
          <TextLink as="button" onClick={() => onNavigate('taxonomy-coverage')}>View all →</TextLink>
        </Flex>
        {isLoading ? (
          <Spinner size="small" />
        ) : data ? (
          <Flex gap="spacingL" flexWrap="wrap">
            <Flex flexDirection="column" gap="spacingXs">
              <Text fontColor="gray500" fontSize="fontSizeS">Content types with taxonomy</Text>
              <Badge variant={data.withConcepts > 0 ? 'positive' : 'warning'}>{data.withConcepts} / {data.totalCt}</Badge>
            </Flex>
            <Flex flexDirection="column" gap="spacingXs">
              <Text fontColor="gray500" fontSize="fontSizeS">Est. coverage</Text>
              <Badge variant={data.pct >= 75 ? 'positive' : data.pct >= 50 ? 'warning' : 'negative'}>{data.pct}%</Badge>
            </Flex>
          </Flex>
        ) : null}
      </Flex>
    </Card>
  );
}
