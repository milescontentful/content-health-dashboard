import { useSDK } from '@contentful/react-apps-toolkit';
import { useQuery } from '@tanstack/react-query';
import { Flex, Text, Card, Badge, Spinner, TextLink, Note } from '@contentful/f36-components';
import type { HomeWidgetProps } from '../types';

const NT_EXPERIENCE_CT = 'nt_experience';
const NT_AUDIENCE_CT = 'nt_audience';

export function PersonalizationWidget({ onNavigate }: HomeWidgetProps) {
  const sdk = useSDK();

  const { data, isLoading } = useQuery({
    queryKey: ['p13n-widget'],
    queryFn: async () => {
      try {
        const [expRes, audRes] = await Promise.all([
          (sdk.cma as any).entry.getMany({ query: { content_type: NT_EXPERIENCE_CT, limit: 1 } }).catch(() => ({ total: 0, items: [] })),
          (sdk.cma as any).entry.getMany({ query: { content_type: NT_AUDIENCE_CT, limit: 1 } }).catch(() => ({ total: 0, items: [] })),
        ]);

        if (expRes.total === 0 && audRes.total === 0) {
          return { configured: false, experiences: 0, audiences: 0, published: 0 };
        }

        // Count published experiences
        const pubRes = await (sdk.cma as any).entry.getMany({
          query: { content_type: NT_EXPERIENCE_CT, 'sys.publishedAt[exists]': true, limit: 1 },
        }).catch(() => ({ total: 0 }));

        return { configured: true, experiences: expRes.total, audiences: audRes.total, published: pubRes.total };
      } catch {
        return { configured: false, experiences: 0, audiences: 0, published: 0 };
      }
    },
    staleTime: 10 * 60 * 1000,
  });

  return (
    <Card padding="default" style={{ height: '100%' }}>
      <Flex flexDirection="column" gap="spacingS">
        <Flex justifyContent="space-between" alignItems="center">
          <Text fontWeight="fontWeightDemiBold">Personalization</Text>
          <TextLink as="button" onClick={() => onNavigate('personalization')}>View all →</TextLink>
        </Flex>
        {isLoading ? (
          <Spinner size="small" />
        ) : !data?.configured ? (
          <Note variant="neutral" style={{ fontSize: 12 }}>
            Ninetailed not detected in this space.
          </Note>
        ) : (
          <Flex gap="spacingL" flexWrap="wrap">
            <Flex flexDirection="column" gap="spacingXs">
              <Text fontColor="gray500" fontSize="fontSizeS">Experiences</Text>
              <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">{data.experiences}</Text>
            </Flex>
            <Flex flexDirection="column" gap="spacingXs">
              <Text fontColor="gray500" fontSize="fontSizeS">Published</Text>
              <Badge variant={data.published > 0 ? 'positive' : 'secondary'}>{data.published}</Badge>
            </Flex>
            <Flex flexDirection="column" gap="spacingXs">
              <Text fontColor="gray500" fontSize="fontSizeS">Audiences</Text>
              <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">{data.audiences}</Text>
            </Flex>
          </Flex>
        )}
      </Flex>
    </Card>
  );
}
