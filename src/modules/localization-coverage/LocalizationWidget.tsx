import { useSDK } from '@contentful/react-apps-toolkit';
import { useQuery } from '@tanstack/react-query';
import { Card, Text, Flex, Skeleton } from '@contentful/f36-components';

function SimpleProgress({ value }: { value: number }) {
  return (
    <div style={{ height: 6, background: '#e5e9ed', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, value)}%`, height: '100%', background: value >= 75 ? '#00C459' : value >= 50 ? '#F0AB00' : '#E44F20', borderRadius: 3 }} />
    </div>
  );
}
import type { HomeWidgetProps } from '../types';

async function fetchCoverageSummary(sdk: ReturnType<typeof useSDK>) {
  const [localesRes, entriesRes] = await Promise.all([
    (sdk.cma as any).locale.getMany({}),
    (sdk.cma as any).entry.getMany({ query: { limit: 200, 'sys.publishedAt[exists]': true } }),
  ]);

  const locales: string[] = localesRes.items.map((l: any) => l.code);
  const entries: any[] = entriesRes.items;

  if (!locales.length || !entries.length) return { locales, averageCoverage: 0, total: 0 };

  let covered = 0;
  let total = 0;
  for (const entry of entries) {
    for (const locale of locales) {
      total++;
      const hasValue = Object.values(entry.fields).some((f: any) => {
        const v = f?.[locale];
        return v !== undefined && v !== null && v !== '';
      });
      if (hasValue) covered++;
    }
  }

  return { locales, averageCoverage: total ? Math.round((covered / total) * 100) : 0, total: entries.length };
}

export function LocalizationWidget({ onNavigate }: HomeWidgetProps) {
  const sdk = useSDK();
  const { data, isLoading } = useQuery({
    queryKey: ['localization-widget'],
    queryFn: () => fetchCoverageSummary(sdk),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <Card onClick={() => onNavigate('localization-coverage')} style={{ cursor: 'pointer' }} padding="default">
      <Text fontWeight="fontWeightDemiBold" marginBottom="spacingS" as="p">Localization</Text>
      {isLoading ? (
        <Skeleton.Container><Skeleton.BodyText numberOfLines={2} /></Skeleton.Container>
      ) : (
        <Flex flexDirection="column" gap="spacingXs">
          <Flex justifyContent="space-between">
            <Text fontColor="gray600" fontSize="fontSizeS">Avg. coverage</Text>
            <Text fontWeight="fontWeightDemiBold">{data?.averageCoverage ?? 0}%</Text>
          </Flex>
          <SimpleProgress value={data?.averageCoverage ?? 0} />
          <Text fontColor="gray500" fontSize="fontSizeS">{data?.total ?? 0} published entries across {data?.locales.length ?? 0} locales</Text>
        </Flex>
      )}
    </Card>
  );
}
