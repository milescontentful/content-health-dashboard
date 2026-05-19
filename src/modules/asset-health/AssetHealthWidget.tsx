import { useSDK } from '@contentful/react-apps-toolkit';
import { useQuery } from '@tanstack/react-query';
import { Flex, Text, Card, Badge, Spinner, TextLink } from '@contentful/f36-components';
import type { HomeWidgetProps } from '../types';

export function AssetHealthWidget({ onNavigate }: HomeWidgetProps) {
  const sdk = useSDK();

  const { data, isLoading } = useQuery({
    queryKey: ['asset-health-widget'],
    queryFn: async () => {
      const [assetsRes, localesRes, entriesRes] = await Promise.all([
        (sdk.cma as any).asset.getMany({ query: { limit: 200 } }),
        (sdk.cma as any).locale.getMany({}),
        (sdk.cma as any).entry.getMany({ query: { limit: 500 } }),
      ]);
      const defaultLocale: string = localesRes.items.find((l: any) => l.default)?.code ?? 'en-US';
      const linkedIds = new Set<string>();
      for (const entry of entriesRes.items) {
        for (const fv of Object.values(entry.fields) as any[]) {
          const v = fv?.[defaultLocale];
          if (v?.sys?.type === 'Asset') linkedIds.add(v.sys.id);
          if (Array.isArray(v)) v.forEach((item: any) => { if (item?.sys?.type === 'Asset') linkedIds.add(item.sys.id); });
        }
      }
      const assets = assetsRes.items;
      return {
        total: assets.length,
        orphans: assets.filter((a: any) => !linkedIds.has(a.sys.id)).length,
        missingAlt: assets.filter((a: any) => {
          const desc = a.fields?.description?.[defaultLocale];
          return !desc;
        }).length,
        oversized: assets.filter((a: any) => {
          const size = a.fields?.file?.[defaultLocale]?.details?.size ?? 0;
          return size > 500 * 1024;
        }).length,
      };
    },
    staleTime: 10 * 60 * 1000,
  });

  return (
    <Card padding="default" style={{ height: '100%' }}>
      <Flex flexDirection="column" gap="spacingS">
        <Flex justifyContent="space-between" alignItems="center">
          <Text fontWeight="fontWeightDemiBold">Asset Health</Text>
          <TextLink as="button" onClick={() => onNavigate('asset-health')}>View all →</TextLink>
        </Flex>
        {isLoading ? (
          <Spinner size="small" />
        ) : data ? (
          <Flex gap="spacingL" flexWrap="wrap">
            <Flex flexDirection="column" gap="spacingXs">
              <Text fontColor="gray500" fontSize="fontSizeS">Total</Text>
              <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">{data.total}</Text>
            </Flex>
            <Flex flexDirection="column" gap="spacingXs">
              <Text fontColor="gray500" fontSize="fontSizeS">Orphaned</Text>
              <Badge variant={data.orphans > 0 ? 'negative' : 'positive'}>{data.orphans}</Badge>
            </Flex>
            <Flex flexDirection="column" gap="spacingXs">
              <Text fontColor="gray500" fontSize="fontSizeS">No alt text</Text>
              <Badge variant={data.missingAlt > 0 ? 'warning' : 'positive'}>{data.missingAlt}</Badge>
            </Flex>
            <Flex flexDirection="column" gap="spacingXs">
              <Text fontColor="gray500" fontSize="fontSizeS">Oversized</Text>
              <Badge variant={data.oversized > 0 ? 'warning' : 'positive'}>{data.oversized}</Badge>
            </Flex>
          </Flex>
        ) : null}
      </Flex>
    </Card>
  );
}
