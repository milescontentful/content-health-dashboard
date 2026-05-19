import { useSDK } from '@contentful/react-apps-toolkit';
import { useQuery } from '@tanstack/react-query';
import { Flex, Text, Badge, Card, Spinner, TextLink } from '@contentful/f36-components';
import type { HomeWidgetProps } from '../types';

export function ReferenceRiskWidget({ onNavigate }: HomeWidgetProps) {
  const sdk = useSDK();

  const { data, isLoading } = useQuery({
    queryKey: ['ref-risk-widget'],
    queryFn: async () => {
      const allEntries: any[] = [];
      let skip = 0;
      let total = Infinity;
      while (skip < total && allEntries.length < 500) {
        const res = await (sdk.cma as any).entry.getMany({ query: { limit: 200, skip } });
        total = res.total;
        allEntries.push(...res.items);
        skip += 200;
        if (res.items.length === 0) break;
      }

      const localesRes = await (sdk.cma as any).locale.getMany({});
      const defaultLocale: string = localesRes.items.find((l: any) => l.default)?.code ?? 'en-US';
      const allEntryIds = new Set<string>(allEntries.map((e: any) => e.sys.id));

      const assetsRes = await (sdk.cma as any).asset.getMany({ query: { limit: 500 } });
      const allAssetIds = new Set<string>(assetsRes.items.map((a: any) => a.sys.id));

      let brokenCount = 0;
      let orphanCount = 0;
      const inboundMap = new Map<string, number>();

      for (const entry of allEntries) {
        const hasInbound = false;
        for (const fieldVal of Object.values(entry.fields) as any[]) {
          const v = fieldVal?.[defaultLocale];
          if (!v) continue;
          const refs: { id: string; type: string }[] = [];
          if (v?.sys?.type === 'Link') refs.push({ id: v.sys.id, type: v.sys.linkType });
          if (Array.isArray(v)) v.forEach((item: any) => { if (item?.sys?.type === 'Link') refs.push({ id: item.sys.id, type: item.sys.linkType }); });
          for (const ref of refs) {
            const exists = ref.type === 'Entry' ? allEntryIds.has(ref.id) : allAssetIds.has(ref.id);
            if (!exists) brokenCount++;
            if (ref.type === 'Entry') {
              inboundMap.set(ref.id, (inboundMap.get(ref.id) ?? 0) + 1);
            }
          }
        }
        if (!hasInbound && !inboundMap.has(entry.sys.id)) orphanCount++;
      }

      return { brokenCount, orphanCount, total: allEntries.length };
    },
    staleTime: 10 * 60 * 1000,
  });

  return (
    <Card padding="default">
      <Flex flexDirection="column" gap="spacingS">
        <Flex justifyContent="space-between" alignItems="center">
          <Text fontWeight="fontWeightDemiBold">Reference Risk</Text>
          <TextLink as="button" onClick={() => onNavigate('reference-risk')}>View all →</TextLink>
        </Flex>
        {isLoading ? (
          <Spinner size="small" />
        ) : data ? (
          <Flex gap="spacingL" flexWrap="wrap">
            <Flex flexDirection="column" gap="spacingXs">
              <Text fontColor="gray500" fontSize="fontSizeS">Broken refs</Text>
              <Badge variant={data.brokenCount > 0 ? 'negative' : 'positive'}>{data.brokenCount}</Badge>
            </Flex>
            <Flex flexDirection="column" gap="spacingXs">
              <Text fontColor="gray500" fontSize="fontSizeS">Orphaned entries</Text>
              <Badge variant="secondary">{data.orphanCount}</Badge>
            </Flex>
          </Flex>
        ) : null}
      </Flex>
    </Card>
  );
}
