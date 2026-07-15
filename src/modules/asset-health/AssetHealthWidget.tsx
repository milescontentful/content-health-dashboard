import { useSDK } from '@contentful/react-apps-toolkit';
import { useQuery } from '@tanstack/react-query';
import { Flex, Text, Card, Badge, Spinner, TextLink } from '@contentful/f36-components';
import type { HomeWidgetProps } from '../types';
import { DEFAULT_ALT_TEXT_SOURCES, fetchAssetScan } from './assetHealthLogic';

export function AssetHealthWidget({ installationParams, onNavigate }: HomeWidgetProps) {
  const sdk = useSDK();
  const altTextSources = installationParams.altTextSources ?? DEFAULT_ALT_TEXT_SOURCES;

  // Same query key as the Asset Health module + summary bar — one shared fetch.
  const { data: scan, isLoading } = useQuery({
    queryKey: ['asset-health', altTextSources],
    queryFn: () => fetchAssetScan(sdk.cma as any, altTextSources),
    staleTime: 10 * 60 * 1000,
  });

  const data = scan
    ? {
        total: scan.rows.length,
        orphans: scan.rows.filter((r) => r.isOrphan).length,
        missingAlt: scan.rows.filter((r) => !r.hasAltText).length,
        oversized: scan.rows.filter((r) => r.size > 500 * 1024).length,
      }
    : null;

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
