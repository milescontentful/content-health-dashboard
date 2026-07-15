import { useQuery } from '@tanstack/react-query';
import { Flex, Text, Badge, Button, Tooltip } from '@contentful/f36-components';
import { DownloadSimpleIcon } from '@contentful/f36-icons';
import tokens from '@contentful/f36-tokens';
import { downloadCsv, formatDateForCsv } from '../lib/csv';
import { ScoreRing, statusColor } from './ScoreRing';
import {
  buildDimensions,
  computeSpaceHealth,
  type HealthDimension,
} from '../lib/healthScore';
import {
  DEFAULT_ALT_TEXT_SOURCES,
  fetchAssetScan,
} from '../modules/asset-health/assetHealthLogic';
import type { AppInstallationParameters } from '../modules/types';

/** Lightweight broken-reference sample: verify every link in the 50 most
 *  recently published entries via sys.id[in] existence queries. */
async function fetchBrokenRefSample(cma: any): Promise<{ broken: number; sampledLinks: number }> {
  const [recentRes, localesRes] = await Promise.all([
    cma.entry.getMany({
      query: { 'sys.publishedAt[exists]': true, limit: 50, order: '-sys.publishedAt' },
    }),
    cma.locale.getMany({}),
  ]);
  const defaultLocale: string = localesRes.items.find((l: any) => l.default)?.code ?? 'en-US';

  const linkedEntryIds = new Set<string>();
  const linkedAssetIds = new Set<string>();
  for (const entry of recentRes.items) {
    for (const fieldVal of Object.values(entry.fields) as any[]) {
      const v = fieldVal?.[defaultLocale];
      const links = Array.isArray(v) ? v : [v];
      for (const link of links) {
        if (link?.sys?.type !== 'Link') continue;
        if (link.sys.linkType === 'Entry') linkedEntryIds.add(link.sys.id);
        if (link.sys.linkType === 'Asset') linkedAssetIds.add(link.sys.id);
      }
    }
  }

  const findMissing = async (type: 'entry' | 'asset', ids: Set<string>) => {
    const missing = new Set(ids);
    const idList = [...ids];
    for (let i = 0; i < idList.length; i += 100) {
      const chunk = idList.slice(i, i + 100);
      const res = await cma[type].getMany({
        query: { 'sys.id[in]': chunk.join(','), select: 'sys.id', limit: 100 },
      });
      res.items.forEach((item: any) => missing.delete(item.sys.id));
    }
    return missing.size;
  };

  const [missingEntries, missingAssets] = await Promise.all([
    findMissing('entry', linkedEntryIds),
    findMissing('asset', linkedAssetIds),
  ]);
  return {
    broken: missingEntries + missingAssets,
    sampledLinks: linkedEntryIds.size + linkedAssetIds.size,
  };
}

function DimensionRow({ dim, onNavigate }: { dim: HealthDimension; onNavigate?: (moduleId: string) => void }) {
  const color = statusColor(dim.score);
  const clickable = !!(dim.moduleId && onNavigate);
  return (
    <Tooltip content={dim.detail} placement="top">
      <div
        role={clickable ? 'button' : undefined}
        onClick={clickable ? () => onNavigate!(dim.moduleId!) : undefined}
        style={{
          display: 'grid',
          gridTemplateColumns: '160px 1fr 36px',
          gap: 10,
          alignItems: 'center',
          padding: '3px 6px',
          borderRadius: 6,
          cursor: clickable ? 'pointer' : 'default',
        }}
        onMouseEnter={(e) => { if (clickable) e.currentTarget.style.background = tokens.gray100; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <Text fontSize="fontSizeS" fontColor="gray600" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {dim.label}
        </Text>
        <div style={{ height: 8, background: tokens.gray200, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${dim.score}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.9s cubic-bezier(0.22, 1, 0.36, 1)' }} />
        </div>
        <Text fontSize="fontSizeS" fontWeight="fontWeightDemiBold" style={{ color: tokens.gray900, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {dim.score}
        </Text>
      </div>
    </Tooltip>
  );
}

export function SpaceHealthScore({
  sdk,
  installationParams,
  onNavigate,
}: {
  sdk: any;
  installationParams: AppInstallationParameters;
  onNavigate?: (moduleId: string) => void;
}) {
  const altTextSources = installationParams.altTextSources ?? DEFAULT_ALT_TEXT_SOURCES;

  const { data: scan } = useQuery({
    queryKey: ['asset-health', altTextSources],
    queryFn: () => fetchAssetScan(sdk.cma, altTextSources),
    staleTime: 5 * 60 * 1000,
  });

  const { data: brokenRefs } = useQuery({
    queryKey: ['home-broken-refs-sample'],
    queryFn: () => fetchBrokenRefSample(sdk.cma),
    staleTime: 5 * 60 * 1000,
  });

  const seoPageContentTypes = installationParams.seoPageContentTypes ?? [];
  const { data: contentTypes } = useQuery({
    queryKey: ['health-content-types'],
    queryFn: async () => (await sdk.cma.contentType.getMany({ query: { limit: 200 } })).items,
    staleTime: 10 * 60 * 1000,
    enabled: seoPageContentTypes.length > 0,
  });

  if (!scan) {
    // Skeleton keeps the layout stable while the scan loads
    return (
      <div style={{ background: '#fff', border: `1px solid ${tokens.gray200}`, borderRadius: 10, padding: 20, marginBottom: 20, height: 172 }}>
        <div style={{ height: '100%', borderRadius: 8, background: `linear-gradient(90deg, ${tokens.gray100} 25%, ${tokens.gray200} 50%, ${tokens.gray100} 75%)`, backgroundSize: '400% 100%', animation: 'chd-shimmer 1.4s ease infinite' }} />
        <style>{'@keyframes chd-shimmer { 0% { background-position: 100% 0 } 100% { background-position: -100% 0 } }'}</style>
      </div>
    );
  }

  const dimensions = buildDimensions({
    assetRows: scan.rows,
    entries: scan.entries,
    locales: scan.locales,
    defaultLocale: scan.defaultLocale,
    brokenRefs,
    contentTypes,
    seoPageContentTypes,
    staleCutoffMonths: installationParams.needsUpdateMonths ?? 6,
  });
  const health = computeSpaceHealth(dimensions);

  const handleExport = () => {
    if (health.overall === null) return;
    const headers = ['Dimension', 'Score', 'Weight', 'Detail'];
    const rows: (string | number)[][] = health.dimensions.map((d) => [d.label, d.score, d.weight, d.detail]);
    rows.push(['OVERALL', health.overall, '', `Grade ${health.grade}`]);
    downloadCsv(`space-health-report-${formatDateForCsv(new Date()).replace(/[ :]/g, '-')}.csv`, headers, rows);
  };

  return (
    <div style={{ background: '#fff', border: `1px solid ${tokens.gray200}`, borderRadius: 10, padding: '18px 24px', marginBottom: 20 }}>
      <Flex gap="spacingXl" alignItems="center" flexWrap="wrap">
        {health.overall !== null && health.grade ? (
          <ScoreRing score={health.overall} grade={health.grade} />
        ) : (
          <Text fontColor="gray500">Not enough content to score this space yet.</Text>
        )}

        <div style={{ flex: 1, minWidth: 320 }}>
          <Flex justifyContent="space-between" alignItems="center" marginBottom="spacingXs">
            <Flex gap="spacingS" alignItems="baseline">
              <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">Space health</Text>
              <Text fontColor="gray500" fontSize="fontSizeS">
                {scan.totalEntries.toLocaleString()} entries · {scan.totalAssets.toLocaleString()} assets
              </Text>
              {scan.totalEntries > scan.scannedEntries && (
                <Badge variant="secondary">sampled {scan.scannedEntries.toLocaleString()}</Badge>
              )}
            </Flex>
            <Button variant="transparent" size="small" startIcon={<DownloadSimpleIcon />} onClick={handleExport}>
              Export report
            </Button>
          </Flex>
          <Flex flexDirection="column" gap="spacing2Xs">
            {health.dimensions.map((d) => (
              <DimensionRow key={d.id} dim={d} onNavigate={onNavigate} />
            ))}
          </Flex>
        </div>
      </Flex>
    </div>
  );
}
