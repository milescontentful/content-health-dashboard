import { useState, useCallback } from 'react';
import { useSDK } from '@contentful/react-apps-toolkit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Flex,
  Text,
  Spinner,
  Note,
  Badge,
  Table,
  Tabs,
  Card,
  Button,
} from '@contentful/f36-components';
import { DownloadSimpleIcon } from '@contentful/f36-icons';
import { downloadCsv, formatDateForCsv } from '../../lib/csv';
import { openAssetInNewTab } from '../../lib/openInNewTab';
import { extractAiActionId, invokeAiAction } from '../../lib/aiActions';
import type { ModuleProps } from '../types';

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

export function AssetHealth({ installationParams }: ModuleProps) {
  const sdk = useSDK();
  const queryClient = useQueryClient();
  const [generatingAlt, setGeneratingAlt] = useState<Record<string, boolean>>({});
  const [altErrors, setAltErrors] = useState<Record<string, string>>({});

  const altTextActionId = extractAiActionId(installationParams.altTextActionId ?? '');
  const spaceId: string = (sdk as any).ids?.space ?? '';
  const environmentId: string = (sdk as any).ids?.environment ?? 'master';

  const { data: assets, isLoading, refetch } = useQuery({
    queryKey: ['asset-health'],
    queryFn: () => fetchAssets(sdk),
    staleTime: 5 * 60 * 1000,
  });

  const handleGenerateAltText = useCallback(async (asset: AssetRow) => {
    setGeneratingAlt((g) => ({ ...g, [asset.id]: true }));
    setAltErrors((e) => { const n = { ...e }; delete n[asset.id]; return n; });

    try {
      const res = await invokeAiAction(
        sdk.cma,
        spaceId,
        environmentId,
        altTextActionId,
        { assetId: asset.id, imageUrl: asset.url },
      );

      const altText: string =
        (res as any)?.altText ??
        (res as any)?.result?.altText ??
        (res as any)?.output ??
        '';
      if (!altText) throw new Error('AI action returned no alt text.');

      // Write alt text back to asset description field
      const localesRes = await (sdk.cma as any).locale.getMany({});
      const defaultLocale: string = localesRes.items.find((l: any) => l.default)?.code ?? 'en-US';
      const fullAsset = await (sdk.cma as any).asset.get({ assetId: asset.id });
      if (!fullAsset.fields.description) fullAsset.fields.description = {};
      fullAsset.fields.description[defaultLocale] = altText;
      await (sdk.cma as any).asset.update({ assetId: asset.id }, fullAsset);

      await queryClient.invalidateQueries({ queryKey: ['asset-health'] });
      sdk.notifier.success('Alt text generated and saved.');
    } catch (err: any) {
      setAltErrors((e) => ({ ...e, [asset.id]: err?.message ?? 'Failed to generate alt text.' }));
    } finally {
      setGeneratingAlt((g) => { const n = { ...g }; delete n[asset.id]; return n; });
    }
  }, [sdk, altTextActionId, spaceId, environmentId, queryClient]);

  if (isLoading) {
    return (
      <Flex flexDirection="column" gap="spacingM">
        <Flex justifyContent="space-between" alignItems="flex-start">
          <Flex flexDirection="column" gap="spacingXs">
            <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">Asset Health</Text>
            <Text fontColor="gray600" fontSize="fontSizeS">Orphaned assets, missing alt text, oversized files, and format breakdown.</Text>
          </Flex>
        </Flex>
        <Flex gap="spacingS" alignItems="center" paddingTop="spacingL">
          <Spinner />
          <Text fontColor="gray500" fontSize="fontSizeS">Loading assets — may take a moment for large spaces…</Text>
        </Flex>
      </Flex>
    );
  }
  if (!assets) return <Note variant="negative">Could not load assets.</Note>;

  const orphans = assets.filter((a) => a.isOrphan);
  const missingAlt = assets.filter((a) => !a.hasAltText);
  const oversized = assets.filter((a) => a.size > SIZE_WARNING_BYTES);

  const formatBreakdown: Record<string, number> = {};
  for (const asset of assets) {
    const ext = (asset.contentType.split('/')[1] ?? 'other').toUpperCase();
    formatBreakdown[ext] = (formatBreakdown[ext] ?? 0) + 1;
  }

  const handleExport = (label: string, rows: AssetRow[]) => {
    const headers = ['Asset ID', 'Title', 'Content Type', 'Size (bytes)', 'Has Alt Text', 'Is Orphan', 'URL'];
    const csvRows = rows.map((a) => [a.id, a.title, a.contentType, a.size, a.hasAltText ? 'Yes' : 'No', a.isOrphan ? 'Yes' : 'No', a.url]);
    downloadCsv(`asset-health-${label}-${formatDateForCsv(new Date()).replace(/[ :]/g, '-')}.csv`, headers, csvRows);
  };

  return (
    <Flex flexDirection="column" gap="spacingL">
      <Flex justifyContent="space-between" alignItems="flex-start">
        <Flex flexDirection="column" gap="spacingXs">
          <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">Asset Health</Text>
          <Text fontColor="gray600" fontSize="fontSizeS">Orphaned assets, missing alt text, oversized files, and format breakdown.</Text>
        </Flex>
        <Flex gap="spacingS">
          <Button variant="secondary" size="small" startIcon={<DownloadSimpleIcon />} onClick={() => handleExport('all', assets)}>
            Export all CSV
          </Button>
          <Button variant="secondary" size="small" onClick={() => refetch()}>Refresh</Button>
        </Flex>
      </Flex>

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

        {/* Orphaned */}
        <Tabs.Panel id="orphans">
          {orphans.length > 0 && (
            <Flex justifyContent="flex-end" marginBottom="spacingS">
              <Button variant="secondary" size="small" startIcon={<DownloadSimpleIcon />} onClick={() => handleExport('orphans', orphans)}>Export list CSV</Button>
            </Flex>
          )}
          {orphans.length === 0 ? <Note variant="positive">No orphaned assets — great!</Note> : (
            <Table>
              <Table.Head><Table.Row>
                <Table.Cell>Asset</Table.Cell><Table.Cell>Type</Table.Cell><Table.Cell>Size</Table.Cell><Table.Cell>Alt text</Table.Cell>
              </Table.Row></Table.Head>
              <Table.Body>
                {orphans.map((a) => (
                  <Table.Row key={a.id}>
                    <Table.Cell>
                      <Flex gap="spacingXs" alignItems="center">
                        {a.contentType.startsWith('image/') && a.url && <img src={`${a.url}?w=32&h=32&fit=thumb`} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />}
                        <Text style={{ cursor: 'pointer', color: '#1773EB', textDecoration: 'underline' }} onClick={() => openAssetInNewTab((sdk as any).ids.space, (sdk as any).ids.environment, a.id)}>{a.title}</Text>
                      </Flex>
                    </Table.Cell>
                    <Table.Cell><Text fontColor="gray500" fontSize="fontSizeS">{a.contentType}</Text></Table.Cell>
                    <Table.Cell><Badge variant={a.size > SIZE_WARNING_BYTES ? 'warning' : 'secondary'}>{formatBytes(a.size)}</Badge></Table.Cell>
                    <Table.Cell><Badge variant={a.hasAltText ? 'positive' : 'negative'}>{a.hasAltText ? 'Yes' : 'Missing'}</Badge></Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Tabs.Panel>

        {/* Missing alt text — with AI generate button */}
        <Tabs.Panel id="alt">
          {!altTextActionId && missingAlt.length > 0 && (
            <Note variant="neutral" style={{ marginBottom: 12 }}>
              <Flex justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="spacingS">
                <Text fontSize="fontSizeS">
                  <strong>Alt Text AI Action available.</strong> Configure an AI Action to generate alt text for images in one click.
                </Text>
                <Badge variant="secondary">Config Screen → AI Audit → Alt Text Generation</Badge>
              </Flex>
            </Note>
          )}
          {missingAlt.length > 0 && (
            <Flex justifyContent="flex-end" marginBottom="spacingS">
              <Button variant="secondary" size="small" startIcon={<DownloadSimpleIcon />} onClick={() => handleExport('alt', missingAlt)}>Export list CSV</Button>
            </Flex>
          )}
          {missingAlt.length === 0 ? <Note variant="positive">All assets have alt text — great!</Note> : (
            <Table>
              <Table.Head><Table.Row>
                <Table.Cell>Asset</Table.Cell><Table.Cell>Type</Table.Cell><Table.Cell>Size</Table.Cell>
                <Table.Cell>{altTextActionId ? 'Generate alt text' : 'Alt text'}</Table.Cell>
              </Table.Row></Table.Head>
              <Table.Body>
                {missingAlt.map((a) => (
                  <Table.Row key={a.id}>
                    <Table.Cell>
                      <Flex gap="spacingXs" alignItems="center">
                        {a.contentType.startsWith('image/') && a.url && <img src={`${a.url}?w=32&h=32&fit=thumb`} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />}
                        <Text style={{ cursor: 'pointer', color: '#1773EB', textDecoration: 'underline' }} onClick={() => openAssetInNewTab((sdk as any).ids.space, (sdk as any).ids.environment, a.id)}>{a.title}</Text>
                      </Flex>
                    </Table.Cell>
                    <Table.Cell><Text fontColor="gray500" fontSize="fontSizeS">{a.contentType}</Text></Table.Cell>
                    <Table.Cell><Badge variant={a.size > SIZE_WARNING_BYTES ? 'warning' : 'secondary'}>{formatBytes(a.size)}</Badge></Table.Cell>
                    <Table.Cell>
                      {altTextActionId && a.contentType.startsWith('image/') && a.url ? (
                        <Flex gap="spacingXs" alignItems="center">
                          {altErrors[a.id] && <Text fontSize="fontSizeS" style={{ color: '#E44F20' }}>{altErrors[a.id]}</Text>}
                          <Button
                            variant="secondary"
                            size="small"
                            isLoading={!!generatingAlt[a.id]}
                            isDisabled={!!generatingAlt[a.id]}
                            onClick={() => handleGenerateAltText(a)}
                          >
                            Generate ✦
                          </Button>
                        </Flex>
                      ) : (
                        <Badge variant="negative">Missing</Badge>
                      )}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Tabs.Panel>

        {/* Oversized */}
        <Tabs.Panel id="oversized">
          {oversized.length > 0 && (
            <Flex justifyContent="flex-end" marginBottom="spacingS">
              <Button variant="secondary" size="small" startIcon={<DownloadSimpleIcon />} onClick={() => handleExport('oversized', oversized)}>Export list CSV</Button>
            </Flex>
          )}
          {oversized.length === 0 ? <Note variant="positive">No oversized assets found.</Note> : (
            <Table>
              <Table.Head><Table.Row>
                <Table.Cell>Asset</Table.Cell><Table.Cell>Type</Table.Cell><Table.Cell>Size</Table.Cell><Table.Cell>Alt text</Table.Cell>
              </Table.Row></Table.Head>
              <Table.Body>
                {oversized.map((a) => (
                  <Table.Row key={a.id}>
                    <Table.Cell>
                      <Flex gap="spacingXs" alignItems="center">
                        {a.contentType.startsWith('image/') && a.url && <img src={`${a.url}?w=32&h=32&fit=thumb`} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />}
                        <Text style={{ cursor: 'pointer', color: '#1773EB', textDecoration: 'underline' }} onClick={() => openAssetInNewTab((sdk as any).ids.space, (sdk as any).ids.environment, a.id)}>{a.title}</Text>
                      </Flex>
                    </Table.Cell>
                    <Table.Cell><Text fontColor="gray500" fontSize="fontSizeS">{a.contentType}</Text></Table.Cell>
                    <Table.Cell><Badge variant="warning">{formatBytes(a.size)}</Badge></Table.Cell>
                    <Table.Cell><Badge variant={a.hasAltText ? 'positive' : 'negative'}>{a.hasAltText ? 'Yes' : 'Missing'}</Badge></Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Tabs.Panel>
      </Tabs>

      {assets.length === 200 && (
        <Note variant="neutral">Showing first 200 assets.</Note>
      )}
    </Flex>
  );
}
