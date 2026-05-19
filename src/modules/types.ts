import type { ComponentType } from 'react';

export interface ModuleProps {
  installationParams: AppInstallationParameters;
}

export interface HomeWidgetProps {
  installationParams: AppInstallationParameters;
  onNavigate: (moduleId: string) => void;
}

export interface DashboardModule {
  id: string;
  label: string;
  description: string;
  icon: string; // lucide icon name
  defaultEnabled: boolean;
  defaultOrder: number;
  component: ComponentType<ModuleProps>;
  homeWidget?: ComponentType<HomeWidgetProps>;
}

export interface ModuleConfig {
  id: string;
  enabled: boolean;
  order: number;
}

// Custom card used by the custom-content module
export interface CustomCard {
  id: string;
  title: string;
  bullets: string[];
  url?: string;
}

export interface ThemeConfig {
  dashboardTitle: string;
  accentColor: string;
  backgroundImageUrl?: string;
  imageBlur: number;
  backgroundColor?: string;
  overlayOpacity: number;
  brandLogoUrl?: string;
}

export const DEFAULT_THEME: ThemeConfig = {
  dashboardTitle: 'Content Health Dashboard',
  accentColor: '#1773EB',
  imageBlur: 5,
  overlayOpacity: 10,
};

export interface AppInstallationParameters {
  // Original content-insights params
  defaultContentTypes?: string[];
  needsUpdateMonths?: number;
  recentlyPublishedDays?: number;
  showUpcomingReleases?: boolean;
  timeToPublishDays?: number;
  defaultCreatorViewSetting?: import('../utils/types').CreatorViewSetting;

  // Module system
  modules?: ModuleConfig[];

  // Theming
  theme?: ThemeConfig;

  // Custom content module data
  customCards?: CustomCard[];

  // SEO/AEO/GEO audit config
  auditFreshnessThresholdDays?: number;

  // Search builder saved queries
  savedSearches?: SavedSearch[];

  // AI Content Audit
  aiActionId?: string;
}

export interface SavedSearch {
  id: string;
  label: string;
  query: SearchQuery;
}

export interface SearchCondition {
  id: string;
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'exists' | 'not_exists' | 'before' | 'after';
  value: string;
  booleanOp: 'AND' | 'OR' | 'NOT';
}

export const CONTENTFUL_BRAND_COLORS = [
  { name: 'Contentful Blue', hex: '#1773EB' },
  { name: 'Red', hex: '#E44F20' },
  { name: 'Yellow', hex: '#FFDA00' },
  { name: 'Green', hex: '#00C459' },
  { name: 'Purple', hex: '#8B2EEA' },
  { name: 'Black', hex: '#282D31' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Teal', hex: '#00897B' },
];

export interface SearchQuery {
  freeText: string;
  conditions: SearchCondition[];
  contentType?: string;
}
