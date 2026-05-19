import { useSDK } from '@contentful/react-apps-toolkit';
import { useQuery } from '@tanstack/react-query';
import { Flex, Text, Card, Badge, Spinner, TextLink } from '@contentful/f36-components';
import type { HomeWidgetProps } from '../types';

export function AnalyticsWidget({ onNavigate }: HomeWidgetProps) {
  const sdk = useSDK();

  const { data, isLoading } = useQuery({
    queryKey: ['analytics-widget'],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const recentRes = await (sdk.cma as any).entry.getMany({
        query: { 'sys.publishedAt[gte]': thirtyDaysAgo, limit: 1 },
      });

      // Count publishing days with activity
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const weekRes = await (sdk.cma as any).entry.getMany({
        query: { 'sys.publishedAt[gte]': weekAgo, limit: 1 },
      });

      return { last30: recentRes.total, last7: weekRes.total };
    },
    staleTime: 10 * 60 * 1000,
  });

  return (
    <Card padding="default">
      <Flex flexDirection="column" gap="spacingS">
        <Flex justifyContent="space-between" alignItems="center">
          <Text fontWeight="fontWeightDemiBold">Analytics</Text>
          <TextLink as="button" onClick={() => onNavigate('analytics')}>View all →</TextLink>
        </Flex>
        {isLoading ? (
          <Spinner size="small" />
        ) : data ? (
          <Flex gap="spacingL" flexWrap="wrap">
            <Flex flexDirection="column" gap="spacingXs">
              <Text fontColor="gray500" fontSize="fontSizeS">Published (30d)</Text>
              <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">{data.last30}</Text>
            </Flex>
            <Flex flexDirection="column" gap="spacingXs">
              <Text fontColor="gray500" fontSize="fontSizeS">This week</Text>
              <Badge variant={data.last7 > 0 ? 'positive' : 'secondary'}>{data.last7}</Badge>
            </Flex>
            <Flex flexDirection="column" gap="spacingXs">
              <Text fontColor="gray500" fontSize="fontSizeS">Contentful Analytics</Text>
              <Badge variant="secondary">Coming soon</Badge>
            </Flex>
          </Flex>
        ) : null}
      </Flex>
    </Card>
  );
}
