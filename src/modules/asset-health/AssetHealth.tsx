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
import { invokeAppActionAndWait } from '../../lib/aiActions';
import { APP_ACTION_IDS } from '../../lib/appActions';
import type { ModuleProps } from '../types';
import {
  DEFAULT_ALT_TEXT_SOURCES,
  fetchAssetScan,
  type AssetRow,
} from './assetHealthLogic';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const SIZE_WARNING_BYTES = 500 * 1024;

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

  const altTextActionId = (installationParams.altTextActionId ?? '').trim();
  const altTextSources = installationParams.altTextSources ?? DEFAULT_ALT_TEXT_SOURCES;
  const appId: string = (sdk as any).ids?.app ?? '';
  const spaceId: string = (sdk as any).ids?.space ?? '';
  const environmentId: string = (sdk as any).ids?.environment ?? 'master';

  const { data: scan, isLoading, refetch } = useQuery({
    queryKey: ['asset-health', altTextSources],
    queryFn: () => fetchAssetScan(sdk.cma as any, altTextSources),
    staleTime: 5 * 60 * 1000,
  });
  const assets = scan?.rows;

  const handleGenerateAltText = useCallback(async (asset: AssetRow) => {
    setGeneratingAlt((g) => ({ ...g, [asset.id]: true }));
    setAltErrors((e) => { const n = { ...e }; delete n[asset.id]; return n; });

    try {
      // Always route through the generateAltText App Function.
      // Pass the configured ID as aiActionId — if it's a Contentful AI Action ID the
      // function proxies the call server-side (bypassing the iframe restriction).
      const result = await invokeAppActionAndWait<{ altText: string; proxied?: boolean }>(
        sdk.cma,
        appId,
        APP_ACTION_IDS.generateAltText,
        { assetId: asset.id, imageUrl: asset.url, locale: sdk.locales.default, aiActionId: altTextActionId },
      );

      const { altText = '', proxied } = result;

      // When the AI Action writes directly to the asset (proxied path), skip the write-back.
      // When the OpenAI path is used, write the returned alt text back to the asset.
      if (!proxied) {
        if (!altText) throw new Error('No alt text returned from the function.');
        const assetData = await (sdk.cma as any).asset.get({ assetId: asset.id, spaceId, environmentId });
        const defaultLocale: string = Object.keys(assetData.fields?.title ?? {})[0] ?? 'en-US';
        if (!assetData.fields) assetData.fields = {};
        if (!assetData.fields.description) assetData.fields.description = {};
        assetData.fields.description[defaultLocale] = altText;
        await (sdk.cma as any).asset.update({ assetId: asset.id, spaceId, environmentId }, assetData);
      }

      await queryClient.invalidateQueries({ queryKey: ['asset-health'] });
      sdk.notifier.success('Alt text generated and saved.');
    } catch (err: any) {
      setAltErrors((e) => ({ ...e, [asset.id]: err?.message ?? 'Failed to generate alt text.' }));
    } finally {
      setGeneratingAlt((g) => { const n = { ...g }; delete n[asset.id]; return n; });
    }
  }, [sdk, altTextActionId, appId, spaceId, environmentId, queryClient]);

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
                    <Table.Cell><Badge variant={a.size > SIZE_WARNING_BYTES ? 'warning' : 'secondary'} style={{ textTransform: 'none' }}>{formatBytes(a.size)}</Badge></Table.Cell>
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
                  <strong>Alt text generation available via App Functions.</strong> Upload the app bundle and configure the{' '}
                  <code>generate-alt-text</code> App Action to enable one-click generation.
                </Text>
                <Badge variant="secondary">Config Screen → App Functions</Badge>
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
                    <Table.Cell><Badge variant={a.size > SIZE_WARNING_BYTES ? 'warning' : 'secondary'} style={{ textTransform: 'none' }}>{formatBytes(a.size)}</Badge></Table.Cell>
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
                    <Table.Cell><Badge variant="warning" style={{ textTransform: 'none' }}>{formatBytes(a.size)}</Badge></Table.Cell>
                    <Table.Cell><Badge variant={a.hasAltText ? 'positive' : 'negative'}>{a.hasAltText ? 'Yes' : 'Missing'}</Badge></Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Tabs.Panel>
      </Tabs>

      {scan && scan.totalAssets > assets.length && (
        <Note variant="neutral">
          Scanned first {assets.length.toLocaleString()} of {scan.totalAssets.toLocaleString()} assets.
        </Note>
      )}
    </Flex>
  );
}
