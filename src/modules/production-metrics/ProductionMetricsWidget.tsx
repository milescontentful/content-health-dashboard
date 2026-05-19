import { useSDK } from '@contentful/react-apps-toolkit';
import { Card, Text, Flex, Badge, Skeleton } from '@contentful/f36-components';
import { useAllEntries } from '../../hooks/useAllEntries';
import { useScheduledActions } from '../../hooks/useScheduledActions';
import { useInstallationParameters } from '../../hooks/useInstallationParameters';
import { MetricsCalculator } from '../../metrics/MetricsCalculator';
import type { HomeWidgetProps } from '../types';

export function ProductionMetricsWidget({ onNavigate }: HomeWidgetProps) {
  const sdk = useSDK();
  const { installation } = useInstallationParameters(sdk as any);
  const { entries, isFetchingEntries } = useAllEntries();
  const { scheduledActions, isFetchingScheduledActions } = useScheduledActions();

  const isLoading = isFetchingEntries || isFetchingScheduledActions;

  const calculator = new MetricsCalculator(entries ?? [], scheduledActions ?? [], {
    needsUpdateMonths: installation?.needsUpdateMonths,
    recentlyPublishedDays: installation?.recentlyPublishedDays,
    timeToPublishDays: installation?.timeToPublishDays,
  });
  const metrics = isLoading ? [] : calculator.getAllMetrics();

  return (
    <Card
      onClick={() => onNavigate('production-metrics')}
      style={{ cursor: 'pointer' }}
    >
      <Text fontWeight="fontWeightDemiBold" marginBottom="spacingS" as="p">
        Production
      </Text>
      {isLoading ? (
        <Skeleton.Container>
          <Skeleton.BodyText numberOfLines={3} />
        </Skeleton.Container>
      ) : (
        <Flex flexDirection="column" gap="spacingXs">
          {metrics.slice(0, 3).map((m) => (
            <Flex key={m.title} justifyContent="space-between" alignItems="center">
              <Text fontColor="gray500" fontSize="fontSizeS">{m.title}</Text>
              <Badge variant={m.isNegative ? 'negative' : 'positive'}>{m.value}</Badge>
            </Flex>
          ))}
        </Flex>
      )}
    </Card>
  );
}
