import type { DashboardModule, ModuleConfig, AppInstallationParameters } from './types';

const _registry = new Map<string, DashboardModule>();

export function registerModule(mod: DashboardModule) {
  _registry.set(mod.id, mod);
}

export function getModule(id: string): DashboardModule | undefined {
  return _registry.get(id);
}

export function getAllModules(): DashboardModule[] {
  return Array.from(_registry.values());
}

/**
 * Returns modules in the order defined by installation parameters,
 * falling back to defaultOrder. Filters out disabled modules.
 */
export function getEnabledModules(params: AppInstallationParameters): DashboardModule[] {
  const configs: ModuleConfig[] = params.modules ?? [];

  const configMap = new Map(configs.map((c) => [c.id, c]));

  return getAllModules()
    .map((mod) => {
      const cfg = configMap.get(mod.id);
      const enabled = cfg ? cfg.enabled : mod.defaultEnabled;
      const order = cfg ? cfg.order : mod.defaultOrder;
      return { mod, enabled, order };
    })
    .filter(({ enabled }) => enabled)
    .sort((a, b) => a.order - b.order)
    .map(({ mod }) => mod);
}

/**
 * Returns ALL modules with their current enabled/order state for use
 * in the Config Screen module manager.
 */
export function getModuleConfigs(params: AppInstallationParameters): Array<DashboardModule & ModuleConfig> {
  const configs: ModuleConfig[] = params.modules ?? [];
  const configMap = new Map(configs.map((c) => [c.id, c]));

  return getAllModules()
    .map((mod) => {
      const cfg = configMap.get(mod.id);
      return {
        ...mod,
        enabled: cfg ? cfg.enabled : mod.defaultEnabled,
        order: cfg ? cfg.order : mod.defaultOrder,
      };
    })
    .sort((a, b) => a.order - b.order);
}
