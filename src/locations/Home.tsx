import { useEffect, useState, useCallback, useRef } from 'react';
import { useSDK } from '@contentful/react-apps-toolkit';
import { HomeAppSDK } from '@contentful/app-sdk';
import { useQuery } from '@tanstack/react-query';
import { Flex, Text, Badge } from '@contentful/f36-components';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getEnabledModules } from '../modules/registry';
import { StudioThemeProvider } from '../modules/StudioThemeProvider';
import type { AltTextSource, AppInstallationParameters, DashboardModule } from '../modules/types';
import { DEFAULT_THEME } from '../modules/types';
import { DEFAULT_ALT_TEXT_SOURCES, fetchAssetScan } from '../modules/asset-health/assetHealthLogic';
import { ModuleErrorBoundary } from '../components/ModuleErrorBoundary';
// Side-effect: registers all modules
import '../modules';

const SESSION_KEY = 'chd-nav-module';

// ─── Sortable widget wrapper ──────────────────────────────────────────────────

function SortableWidget({
  mod,
  params,
  onNavigate,
}: {
  mod: DashboardModule;
  params: AppInstallationParameters;
  onNavigate: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: mod.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    cursor: 'default',
    height: '100%',
  };

  const Widget = mod.homeWidget!;

  return (
    <div ref={setNodeRef} style={style}>
      {/* Drag handle — top-right corner */}
      <div
        {...attributes}
        {...listeners}
        title="Drag to reorder"
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 10,
          cursor: 'grab',
          color: '#8c9bab',
          padding: '4px',
          borderRadius: 4,
          lineHeight: 1,
          fontSize: 16,
          userSelect: 'none',
        }}
      >
        ⠿
      </div>
      <ModuleErrorBoundary moduleLabel={mod.label}>
        <Widget installationParams={params} onNavigate={onNavigate} />
      </ModuleErrorBoundary>
    </div>
  );
}

// ─── Health summary bar ───────────────────────────────────────────────────────

function HealthSummaryBar({ sdk, altTextSources }: { sdk: any; altTextSources: AltTextSource[] }) {
  // Shares the asset scan (and its React Query cache) with the Asset Health module/widget,
  // so missing-alt counts respect configured alt-text sources everywhere.
  const { data: scan } = useQuery({
    queryKey: ['asset-health', altTextSources],
    queryFn: () => fetchAssetScan(sdk.cma, altTextSources),
    staleTime: 5 * 60 * 1000,
  });

  const { data: brokenRefs } = useQuery({
    queryKey: ['home-broken-refs-sample'],
    queryFn: async () => {
      // Broken ref count (lightweight: just check last 50 published entries).
      // Linked IDs are verified with sys.id[in] existence queries so links to
      // older entries aren't falsely counted as broken.
      const [recentRes, localesRes] = await Promise.all([
        sdk.cma.entry.getMany({
          query: { 'sys.publishedAt[exists]': true, limit: 50, order: '-sys.publishedAt' },
        }),
        sdk.cma.locale.getMany({}),
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
          const res = await sdk.cma[type].getMany({
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
      return missingEntries + missingAssets;
    },
    staleTime: 5 * 60 * 1000,
  });

  const data = scan
    ? {
        totalEntries: scan.totalEntries,
        totalAssets: scan.rows.length,
        missingAlt: scan.rows.filter((r) => !r.hasAltText).length,
        orphanedAssets: scan.rows.filter((r) => r.isOrphan).length,
        brokenRefs: brokenRefs ?? 0,
      }
    : null;

  if (!data) return null;

  const issues = data.missingAlt + data.orphanedAssets + data.brokenRefs;
  const healthVariant = issues === 0 ? 'positive' : issues < 10 ? 'warning' : 'negative';

  return (
    <Flex
      gap="spacingL"
      flexWrap="wrap"
      alignItems="center"
      style={{
        background: '#fff',
        border: '1px solid #e5e9ed',
        borderRadius: 8,
        padding: '12px 20px',
        marginBottom: 20,
      }}
    >
      <Flex flexDirection="column" gap="spacingXs">
        <Text fontColor="gray500" fontSize="fontSizeS">Space health</Text>
        <Badge variant={healthVariant}>
          {issues === 0 ? 'All clear' : `${issues} issue${issues !== 1 ? 's' : ''} found`}
        </Badge>
      </Flex>
      <div style={{ width: 1, background: '#e5e9ed', alignSelf: 'stretch' }} />
      <Flex flexDirection="column" gap="spacingXs">
        <Text fontColor="gray500" fontSize="fontSizeS">Entries</Text>
        <Text fontWeight="fontWeightDemiBold">{data.totalEntries.toLocaleString()}</Text>
      </Flex>
      <Flex flexDirection="column" gap="spacingXs">
        <Text fontColor="gray500" fontSize="fontSizeS">Assets</Text>
        <Text fontWeight="fontWeightDemiBold">{data.totalAssets}</Text>
      </Flex>
      {data.missingAlt > 0 && (
        <Flex flexDirection="column" gap="spacingXs">
          <Text fontColor="gray500" fontSize="fontSizeS">Missing alt text</Text>
          <Badge variant="warning">{data.missingAlt}</Badge>
        </Flex>
      )}
      {data.brokenRefs > 0 && (
        <Flex flexDirection="column" gap="spacingXs">
          <Text fontColor="gray500" fontSize="fontSizeS">Broken refs (sample)</Text>
          <Badge variant="negative">{data.brokenRefs}</Badge>
        </Flex>
      )}
      {issues === 0 && (
        <Text fontColor="gray500" fontSize="fontSizeS">
          No issues detected in the last scan.
        </Text>
      )}
    </Flex>
  );
}

// ─── Home ─────────────────────────────────────────────────────────────────────

const Home = () => {
  const sdk = useSDK<HomeAppSDK>();

  useEffect(() => {
    (sdk as any).app?.setReady?.().catch(console.error);
  }, [sdk]);

  const params = (sdk.parameters?.installation ?? {}) as AppInstallationParameters;
  const theme = params.theme ?? DEFAULT_THEME;
  const enabledModules = getEnabledModules(params);
  const modulesWithWidgets = enabledModules.filter((m) => m.homeWidget);

  // Auto-save order to installation params via CMA
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveOrder = useCallback(async (orderedIds: string[]) => {
    try {
      const allModules = getEnabledModules(params);
      const updatedModules = orderedIds.map((id, idx) => {
        const existing = params.modules?.find((m) => m.id === id);
        return { id, enabled: existing?.enabled ?? true, order: idx };
      });
      // Include any modules not in the widget list (no homeWidget) with their existing order
      const widgetIds = new Set(orderedIds);
      const otherModules = (params.modules ?? allModules.map((m, i) => ({ id: m.id, enabled: true, order: i })))
        .filter((m) => !widgetIds.has(m.id));
      const finalModules = [...updatedModules, ...otherModules];

      await (sdk.cma as any).appInstallation.upsert(
        { appDefinitionId: (sdk as any).ids.app },
        { parameters: { ...params, modules: finalModules } },
      );
      sdk.notifier.success('Card order saved');
    } catch {
      // Silently fail — order stays in local state
    }
  }, [sdk, params]);

  // Local order state — auto-saves on drag
  const [order, setOrder] = useState(() => modulesWithWidgets.map((m) => m.id));

  // Keep order in sync if modules change (e.g. after config update)
  const moduleIdKey = modulesWithWidgets.map((m) => m.id).join(',');
  useEffect(() => {
    setOrder((prev) => {
      const newIds = moduleIdKey.split(',').filter(Boolean);
      const merged = [...prev.filter((id) => newIds.includes(id)), ...newIds.filter((id) => !prev.includes(id))];
      return merged;
    });
  }, [moduleIdKey]);

  const sortedModules = order
    .map((id) => modulesWithWidgets.find((m) => m.id === id))
    .filter(Boolean) as DashboardModule[];

  const navigateTo = useCallback((moduleId: string) => {
    // Store target module so Page.tsx picks it up on mount
    sessionStorage.setItem(SESSION_KEY, moduleId);
    // Navigate to Page location
    const nav = (sdk as any).navigator;
    if (nav?.openCurrentAppPage) {
      nav.openCurrentAppPage();
    } else if (nav?.openAppPage) {
      nav.openAppPage({});
    }
  }, [sdk]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setOrder((prev) => {
        const oldIdx = prev.indexOf(String(active.id));
        const newIdx = prev.indexOf(String(over.id));
        const newOrder = arrayMove(prev, oldIdx, newIdx);
        // Debounced auto-save
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => saveOrder(newOrder), 600);
        return newOrder;
      });
    }
  };

  return (
    <StudioThemeProvider theme={theme}>
      <div style={{ padding: '24px', minHeight: '100vh', background: '#f7f9fa' }}>
        {/* Header */}
        <Flex alignItems="center" justifyContent="space-between" marginBottom="spacingM">
          <Flex alignItems="center" gap="spacingS">
            {theme.brandLogoUrl && (
              <img src={theme.brandLogoUrl} alt="" style={{ height: 28, width: 28, objectFit: 'contain' }} />
            )}
            <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeXl">
              {theme.dashboardTitle}
            </Text>
          </Flex>
          <Text fontColor="gray500" fontSize="fontSizeS">
            Drag cards to reorder
          </Text>
        </Flex>

        {/* Health summary */}
        <HealthSummaryBar sdk={sdk as any} altTextSources={params.altTextSources ?? DEFAULT_ALT_TEXT_SOURCES} />

        {/* Widget grid */}
        {sortedModules.length === 0 ? (
          <Text fontColor="gray500">
            No home widgets enabled. Open the full dashboard to explore your content health.
          </Text>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={order} strategy={rectSortingStrategy}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gridAutoRows: 'minmax(190px, auto)',
                  gap: 16,
                  alignItems: 'stretch',
                }}
              >
                {sortedModules.map((mod) => (
                  <SortableWidget key={mod.id} mod={mod} params={params} onNavigate={navigateTo} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </StudioThemeProvider>
  );
};

export default Home;
