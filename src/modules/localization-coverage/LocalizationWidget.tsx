import { useSDK } from '@contentful/react-apps-toolkit';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { Card, Text, Flex, Skeleton, TextLink } from '@contentful/f36-components';
import type { HomeWidgetProps } from '../types';

function SimpleProgress({ value }: { value: number }) {
  return (
    <div style={{ height: 6, background: '#e5e9ed', borderRadius: 3, overflow: 'hidden' }}>
      <div
        style={{
          width: `${Math.min(100, value)}%`,
          height: '100%',
          background: value >= 75 ? '#00C459' : value >= 50 ? '#F0AB00' : '#E44F20',
          borderRadius: 3,
        }}
      />
    </div>
  );
}

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
    <Card padding="default" style={{ height: '100%', cursor: 'pointer' }} onClick={() => onNavigate('localization-coverage')}>
      <Flex flexDirection="column" gap="spacingS">
        <Flex justifyContent="space-between" alignItems="center">
          <Text fontWeight="fontWeightDemiBold">Localization</Text>
          <TextLink as="button" onClick={(e: React.MouseEvent) => { e.stopPropagation(); onNavigate('localization-coverage'); }}>
            View all →
          </TextLink>
        </Flex>

        {isLoading ? (
          <Skeleton.Container><Skeleton.BodyText numberOfLines={3} /></Skeleton.Container>
        ) : (
          <Flex flexDirection="column" gap="spacingXs">
            <Flex justifyContent="space-between" alignItems="center">
              <Text fontColor="gray500" fontSize="fontSizeS">Avg. coverage</Text>
              <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL"
                style={{ color: (data?.averageCoverage ?? 0) >= 75 ? '#00C459' : (data?.averageCoverage ?? 0) >= 50 ? '#F0AB00' : '#E44F20' }}>
                {data?.averageCoverage ?? 0}%
              </Text>
            </Flex>
            <SimpleProgress value={data?.averageCoverage ?? 0} />
            <Text fontColor="gray500" fontSize="fontSizeS">
              {data?.total ?? 0} published entries across {data?.locales.length ?? 0} locale{(data?.locales.length ?? 0) !== 1 ? 's' : ''}
            </Text>
            {(data?.locales.length ?? 0) > 1 && (
              <Flex gap="spacingXs" flexWrap="wrap">
                {data!.locales.map((l) => (
                  <Text key={l} fontSize="fontSizeS" style={{ background: '#f1f3f4', borderRadius: 4, padding: '2px 6px' }}>{l}</Text>
                ))}
              </Flex>
            )}
          </Flex>
        )}
      </Flex>
    </Card>
  );
}
