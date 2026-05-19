import { useSDK } from '@contentful/react-apps-toolkit';
import { useQuery } from '@tanstack/react-query';
import {
  Flex,
  Text,
  Spinner,
  Note,
  Card,
  Badge,
  Table,
  Tabs,
} from '@contentful/f36-components';

interface AssetRow {
  id: string;
  title: string;
  url: string;
  contentType: string;
  size: number; // bytes
  hasAltText: boolean;
  usageCount: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const SIZE_WARNING_BYTES = 500 * 1024; // 500 KB

async function fetchAssets(sdk: ReturnType<typeof useSDK>): Promise<AssetRow[]> {
  // Fetch assets and entry link data
  const [assetsRes, localesRes] = await Promise.all([
    (sdk.cma as any).asset.getMany({ query: { limit: 200 } }),
    (sdk.cma as any).locale.getMany({}),
  ]);

  const defaultLocale: string = localesRes.items.find((l: any) => l.default)?.code ?? 'en-US';

  // Build orphan detection: get all entries and collect linked asset IDs
  const entriesRes = await (sdk.cma as any).entry.getMany({ query: { limit: 1000 } });
  const linkedAssetIds = new Set<string>();
  for (const entry of entriesRes.items) {
    for (const fieldVal of Object.values(entry.fields) as any[]) {
      const localeVal = fieldVal?.[defaultLocale];
      if (localeVal?.sys?.type === 'Asset') linkedAssetIds.add(localeVal.sys.id);
      if (Array.isArray(localeVal)) {
        for (const item of localeVal) {
          if (item?.sys?.type === 'Asset') linkedAssetIds.add(item.sys.id);
        }
      }
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
      usageCount: linkedAssetIds.has(asset.sys.id) ? 1 : 0, // 0 = orphan heuristic
    };
  });
}

export function AssetHealth() {
  const sdk = useSDK();

  const { data: assets, isLoading } = useQuery({
    queryKey: ['asset-health'],
    queryFn: () => fetchAssets(sdk),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <Flex justifyContent="center" paddingTop="spacingXl"><Spinner /></Flex>;
  if (!assets) return <Note variant="negative">Could not load assets.</Note>;

  const orphans = assets.filter((a) => a.usageCount === 0);
  const missingAlt = assets.filter((a) => !a.hasAltText);
  const oversized = assets.filter((a) => a.size > SIZE_WARNING_BYTES);

  const formatBreakdown: Record<string, number> = {};
  for (const asset of assets) {
    const ext = asset.contentType.split('/')[1] ?? 'other';
    formatBreakdown[ext] = (formatBreakdown[ext] ?? 0) + 1;
  }

  return (
    <Flex flexDirection="column" gap="spacingM">
      <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">Asset Health</Text>

      {/* Summary cards */}
      <Flex gap="spacingM" flexWrap="wrap">
        {[
          { label: 'Total assets', value: assets.length, variant: 'secondary' as const },
          { label: 'Orphaned', value: orphans.length, variant: orphans.length > 0 ? 'negative' as const : 'positive' as const },
          { label: 'Missing alt text', value: missingAlt.length, variant: missingAlt.length > 0 ? 'warning' as const : 'positive' as const },
          { label: 'Oversized (> 500 KB)', value: oversized.length, variant: oversized.length > 0 ? 'warning' as const : 'positive' as const },
        ].map(({ label, value, variant }) => (
          <Card key={label} padding="default" style={{ minWidth: 140, textAlign: 'center' }}>
            <Text fontColor="gray600" fontSize="fontSizeS">{label}</Text>
            <Badge variant={variant} style={{ fontSize: 18, padding: '4px 8px', marginTop: 4 }}>{value}</Badge>
          </Card>
        ))}
        {/* Format breakdown */}
        {Object.entries(formatBreakdown).map(([fmt, count]) => (
          <Card key={fmt} padding="default" style={{ minWidth: 100, textAlign: 'center' }}>
            <Text fontColor="gray600" fontSize="fontSizeS">{fmt.toUpperCase()}</Text>
            <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeXl" as="p">{count}</Text>
          </Card>
        ))}
      </Flex>

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
                            <img src={`${a.url}?w=40&h=40&fit=thumb`} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4 }} />
                          )}
                          <Text
                            style={{ cursor: 'pointer', color: '#1773EB', textDecoration: 'underline' }}
                            onClick={() => (sdk as any).navigator?.openAsset(a.id, { slideIn: true })}
                          >
                            {a.title}
                          </Text>
                        </Flex>
                      </Table.Cell>
                      <Table.Cell>{a.contentType}</Table.Cell>
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
    </Flex>
  );
}
