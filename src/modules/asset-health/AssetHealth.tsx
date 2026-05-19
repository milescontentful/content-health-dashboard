import { useSDK } from '@contentful/react-apps-toolkit';
import { useQuery } from '@tanstack/react-query';
import {
  Flex,
  Text,
  Spinner,
  Note,
  Badge,
  Table,
  Tabs,
  Card,
} from '@contentful/f36-components';

interface AssetRow {
  id: string;
  title: string;
  url: string;
  contentType: string;
  size: number;
  hasAltText: boolean;
  isOrphan: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const SIZE_WARNING_BYTES = 500 * 1024;

async function fetchAssets(sdk: ReturnType<typeof useSDK>): Promise<AssetRow[]> {
  const [assetsRes, localesRes, entriesRes] = await Promise.all([
    (sdk.cma as any).asset.getMany({ query: { limit: 200 } }),
    (sdk.cma as any).locale.getMany({}),
    (sdk.cma as any).entry.getMany({ query: { limit: 1000 } }),
  ]);

  const defaultLocale: string = localesRes.items.find((l: any) => l.default)?.code ?? 'en-US';

  const linkedAssetIds = new Set<string>();
  for (const entry of entriesRes.items) {
    for (const fieldVal of Object.values(entry.fields) as any[]) {
      const v = fieldVal?.[defaultLocale];
      if (v?.sys?.type === 'Asset') linkedAssetIds.add(v.sys.id);
      if (Array.isArray(v)) v.forEach((item: any) => { if (item?.sys?.type === 'Asset') linkedAssetIds.add(item.sys.id); });
    }
  }

  return assetsRes.items.map((asset: any) => {
    const fileField = asset.fields?.file?.[defaultLocale];
    const titleField = asset.fields?.title?.[defaultLocale];
    const descriptionField = asset.fields?.description?.[defaultLocale];
    const url: string = fileField?.url ? `https:${fileField.url}` : '';
    return {
      id: asset.sys.id,
      title: titleField ?? asset.sys.id,
      url,
      contentType: fileField?.contentType ?? 'unknown',
      size: fileField?.details?.size ?? 0,
      hasAltText: !!descriptionField,
      isOrphan: !linkedAssetIds.has(asset.sys.id),
    };
  });
}

// Compact metric pill — mirrors Content Insights style
function MetricPill({ label, value, variant }: { label: string; value: number; variant: 'positive' | 'negative' | 'warning' | 'secondary' }) {
  return (
    <Flex flexDirection="column" gap="spacingXs" style={{ minWidth: 100 }}>
      <Text fontColor="gray500" fontSize="fontSizeS">{label}</Text>
      <Badge variant={variant} style={{ fontSize: 16, fontWeight: 700, padding: '2px 8px', width: 'fit-content' }}>
        {value}
      </Badge>
    </Flex>
  );
}

export function AssetHealth() {
  const sdk = useSDK();

  const { data: assets, isLoading } = useQuery({
    queryKey: ['asset-health'],
    queryFn: () => fetchAssets(sdk),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <Flex paddingTop="spacingXl"><Spinner /></Flex>;
  if (!assets) return <Note variant="negative">Could not load assets.</Note>;

  const orphans = assets.filter((a) => a.isOrphan);
  const missingAlt = assets.filter((a) => !a.hasAltText);
  const oversized = assets.filter((a) => a.size > SIZE_WARNING_BYTES);

  const formatBreakdown: Record<string, number> = {};
  for (const asset of assets) {
    const ext = (asset.contentType.split('/')[1] ?? 'other').toUpperCase();
    formatBreakdown[ext] = (formatBreakdown[ext] ?? 0) + 1;
  }

  return (
    <Flex flexDirection="column" gap="spacingL">
      <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">Asset Health</Text>

      {/* Compact metric strip */}
      <Card padding="default">
        <Flex gap="spacingXl" flexWrap="wrap" alignItems="flex-start">
          <MetricPill label="Total assets" value={assets.length} variant="secondary" />
          <MetricPill label="Orphaned" value={orphans.length} variant={orphans.length > 0 ? 'negative' : 'positive'} />
          <MetricPill label="Missing alt text" value={missingAlt.length} variant={missingAlt.length > 0 ? 'warning' : 'positive'} />
          <MetricPill label="Oversized (> 500 KB)" value={oversized.length} variant={oversized.length > 0 ? 'warning' : 'positive'} />

          {/* Format breakdown inline */}
          <div style={{ width: 1, background: '#e5e9ed', alignSelf: 'stretch', margin: '0 8px' }} />
          {Object.entries(formatBreakdown).map(([fmt, count]) => (
            <Flex key={fmt} flexDirection="column" gap="spacingXs" style={{ minWidth: 56 }}>
              <Text fontColor="gray500" fontSize="fontSizeS">{fmt}</Text>
              <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">{count}</Text>
            </Flex>
          ))}
        </Flex>
      </Card>

      {/* Detail tabs */}
      <Tabs defaultTab="orphans">
        <Tabs.List>
          <Tabs.Tab panelId="orphans">Orphaned ({orphans.length})</Tabs.Tab>
          <Tabs.Tab panelId="alt">Missing alt ({missingAlt.length})</Tabs.Tab>
          <Tabs.Tab panelId="oversized">Oversized ({oversized.length})</Tabs.Tab>
        </Tabs.List>

        {[
          { id: 'orphans', rows: orphans, emptyMsg: 'No orphaned assets — great!' },
          { id: 'alt', rows: missingAlt, emptyMsg: 'All assets have alt text — great!' },
          { id: 'oversized', rows: oversized, emptyMsg: 'No oversized assets found.' },
        ].map(({ id, rows, emptyMsg }) => (
          <Tabs.Panel key={id} id={id}>
            {rows.length === 0 ? (
              <Note variant="positive">{emptyMsg}</Note>
            ) : (
              <Table>
                <Table.Head>
                  <Table.Row>
                    <Table.Cell>Asset</Table.Cell>
                    <Table.Cell>Type</Table.Cell>
                    <Table.Cell>Size</Table.Cell>
                    <Table.Cell>Alt text</Table.Cell>
                  </Table.Row>
                </Table.Head>
                <Table.Body>
                  {rows.map((a) => (
                    <Table.Row key={a.id}>
                      <Table.Cell>
                        <Flex gap="spacingXs" alignItems="center">
                          {a.contentType.startsWith('image/') && a.url && (
                            <img
                              src={`${a.url}?w=32&h=32&fit=thumb`}
                              alt=""
                              style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                            />
                          )}
                          <Text
                            style={{ cursor: 'pointer', color: '#1773EB', textDecoration: 'underline' }}
                            onClick={() => (sdk as any).navigator?.openAsset(a.id, { slideIn: true })}
                          >
                            {a.title}
                          </Text>
                        </Flex>
                      </Table.Cell>
                      <Table.Cell>
                        <Text fontColor="gray500" fontSize="fontSizeS">{a.contentType}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge variant={a.size > SIZE_WARNING_BYTES ? 'warning' : 'secondary'}>
                          {formatBytes(a.size)}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge variant={a.hasAltText ? 'positive' : 'negative'}>
                          {a.hasAltText ? 'Yes' : 'Missing'}
                        </Badge>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            )}
          </Tabs.Panel>
        ))}
      </Tabs>

      {assets.length === 200 && (
        <Note variant="neutral">Showing first 200 assets.</Note>
      )}
    </Flex>
  );
}
