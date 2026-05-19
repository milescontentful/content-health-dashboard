import { useState, useEffect } from 'react';
import { useSDK } from '@contentful/react-apps-toolkit';
import { PageAppSDK } from '@contentful/app-sdk';
import { Flex, Text, Spinner } from '@contentful/f36-components';
import { getEnabledModules } from '../modules/registry';
import { StudioThemeProvider, useTheme } from '../modules/StudioThemeProvider';
import type { AppInstallationParameters } from '../modules/types';
import { DEFAULT_THEME } from '../modules/types';
// Side-effect: registers all modules into the registry
import '../modules';

function TabBar({
  modules,
  activeId,
  onSelect,
}: {
  modules: Array<{ id: string; label: string }>;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const theme = useTheme();
  return (
    <nav
      style={{
        display: 'flex',
        gap: '4px',
        borderBottom: '1px solid #e5e9ed',
        padding: '0 24px',
        background: '#fff',
      }}
    >
      {modules.map((mod) => {
        const isActive = mod.id === activeId;
        return (
          <button
            key={mod.id}
            onClick={() => onSelect(mod.id)}
            style={{
              padding: '12px 16px',
              fontSize: '14px',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? theme.accentColor : '#6f7e8c',
              background: 'none',
              border: 'none',
              borderBottom: isActive ? `2px solid ${theme.accentColor}` : '2px solid transparent',
              cursor: 'pointer',
              marginBottom: '-1px',
              transition: 'color 0.15s',
            }}
          >
            {mod.label}
          </button>
        );
      })}
    </nav>
  );
}

function PageShell({ params }: { params: AppInstallationParameters }) {
  const theme = params.theme ?? DEFAULT_THEME;
  const enabledModules = getEnabledModules(params);
  const [activeId, setActiveId] = useState(enabledModules[0]?.id ?? '');

  useEffect(() => {
    if (!activeId && enabledModules.length > 0) {
      setActiveId(enabledModules[0].id);
    }
  }, [enabledModules, activeId]);

  if (enabledModules.length === 0) {
    return (
      <Flex justifyContent="center" alignItems="center" style={{ height: '60vh' }}>
        <Text fontColor="gray500">No modules enabled. Configure the app to enable modules.</Text>
      </Flex>
    );
  }

  const ActiveModule = enabledModules.find((m) => m.id === activeId);

  return (
    <StudioThemeProvider theme={theme}>
      <div style={{ minHeight: '100vh', background: '#f7f9fa' }}>
        {/* Background image layer */}
        {theme.backgroundImageUrl && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 0,
              backgroundImage: `url('${theme.backgroundImageUrl}')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: `blur(${(theme.imageBlur ?? 5) * 0.4}px)`,
              opacity: 0.85,
            }}
          />
        )}
        {theme.backgroundImageUrl && theme.backgroundColor && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1,
              background: theme.backgroundColor,
              opacity: (theme.overlayOpacity ?? 10) / 100,
            }}
          />
        )}

        {/* App shell */}
        <div style={{ position: 'relative', zIndex: 10 }}>
          {/* Header */}
          <header style={{ background: '#fff', borderBottom: '1px solid #e5e9ed' }}>
            <Flex alignItems="center" gap="spacingS" style={{ padding: '12px 24px' }}>
              {theme.brandLogoUrl && (
                <img src={theme.brandLogoUrl} alt="" style={{ height: 28, width: 28, objectFit: 'contain' }} />
              )}
              <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">
                {theme.dashboardTitle}
              </Text>
            </Flex>
            <TabBar modules={enabledModules} activeId={activeId} onSelect={setActiveId} />
          </header>

          {/* Active module */}
          <main style={{ padding: '24px' }}>
            {ActiveModule ? (
              <ActiveModule.component installationParams={params} />
            ) : (
              <Flex justifyContent="center" style={{ paddingTop: '48px' }}>
                <Spinner />
              </Flex>
            )}
          </main>
        </div>
      </div>
    </StudioThemeProvider>
  );
}

const Page = () => {
  const sdk = useSDK<PageAppSDK>();

  useEffect(() => {
    (sdk as any).app?.setReady?.().catch(console.error);
  }, [sdk]);

  const params = (sdk.parameters?.installation ?? {}) as AppInstallationParameters;
  return <PageShell params={params} />;
};

export default Page;
