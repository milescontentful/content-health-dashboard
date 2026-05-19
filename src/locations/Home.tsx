import { useEffect } from 'react';
import { useSDK } from '@contentful/react-apps-toolkit';
import { HomeAppSDK } from '@contentful/app-sdk';
import { Flex, Text, Grid } from '@contentful/f36-components';
import { getEnabledModules } from '../modules/registry';
import { StudioThemeProvider } from '../modules/StudioThemeProvider';
import type { AppInstallationParameters } from '../modules/types';
import { DEFAULT_THEME } from '../modules/types';
// Side-effect: registers all modules
import '../modules';

const Home = () => {
  const sdk = useSDK<HomeAppSDK>();

  useEffect(() => {
    (sdk as any).app?.setReady?.().catch(console.error);
  }, [sdk]);

  const params = (sdk.parameters?.installation ?? {}) as AppInstallationParameters;
  const theme = params.theme ?? DEFAULT_THEME;
  const enabledModules = getEnabledModules(params);
  const modulesWithWidgets = enabledModules.filter((m) => m.homeWidget);

  const navigateTo = (moduleId: string) => {
    // Navigate to Page location — sdk.navigator is available in Home
    (sdk as any).navigator?.openAppPage?.({ path: `?module=${moduleId}` });
  };

  return (
    <StudioThemeProvider theme={theme}>
      <div style={{ padding: '24px', minHeight: '100vh', background: '#f7f9fa' }}>
        <Flex alignItems="center" gap="spacingS" marginBottom="spacingL">
          {theme.brandLogoUrl && (
            <img src={theme.brandLogoUrl} alt="" style={{ height: 28, width: 28, objectFit: 'contain' }} />
          )}
          <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeXl">
            {theme.dashboardTitle}
          </Text>
        </Flex>

        {modulesWithWidgets.length === 0 ? (
          <Text fontColor="gray500">
            No home widgets enabled. Open the full dashboard to explore your content health.
          </Text>
        ) : (
          <Grid columns="repeat(auto-fill, minmax(300px, 1fr))" rowGap="spacingM" columnGap="spacingM">
            {modulesWithWidgets.map((mod) => {
              const Widget = mod.homeWidget!;
              return <Widget key={mod.id} installationParams={params} onNavigate={navigateTo} />;
            })}
          </Grid>
        )}
      </div>
    </StudioThemeProvider>
  );
};

export default Home;
