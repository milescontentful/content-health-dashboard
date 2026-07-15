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

  // SEO/GEO audit config
  auditFreshnessThresholdDays?: number;
  seoPageContentTypes?: string[];   // CTs shown in SEO/GEO content type picker

  // Search builder saved queries
  savedSearches?: SavedSearch[];

  // AI Content Audit
  aiActionId?: string;

  // Personalization (Ninetailed)
  ninetailedApiKey?: string;
  ninetailedEnvironmentId?: string;

  // Contentful Analytics
  analyticsApiKey?: string;

  // Reference Risk — content types treated as intentional entry-points (not flagged as orphaned)
  topLevelContentTypes?: string[];

  // Content Ops — App Action / App Function action IDs
  translationActionId?: string;    // translate-fields action (App Function or Contentful AI Action)
  altTextActionId?: string;        // generate-alt-text action (App Function or Contentful AI Action)
  seoAuditActionId?: string;       // seo-audit action (App Function — LLM-enhanced SEO/GEO)

  // OpenAI API key used by App Functions when no Contentful AI Action is
  // configured. Read server-side only; visible to space admins like any
  // installation parameter.
  openAiApiKey?: string;

  // Asset Health — configurable alt text sources
  // Each source defines a content type + field to check for alt text.
  // Use '__asset__' as contentType to check a field directly on the native asset.
  // Example: [{ contentType: '__asset__', field: 'description' }, { contentType: 'assetWrapper', field: 'caption' }]
  altTextSources?: AltTextSource[];

  // Brand voice guidelines — passed to gradeContent for tone consistency analysis
  brandVoice?: string;

  // AI Content Audit action ID (grade-content function)
  // Reuses aiActionId key for backward compatibility with existing installations.
  // aiActionId is declared above in "AI Content Audit".
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

export interface AltTextSource {
  contentType: string; // '__asset__' for native asset field, or a content type ID (e.g. 'assetWrapper')
  field: string;       // field ID to check for alt text (e.g. 'description', 'caption', 'altText')
}

export interface SearchQuery {
  freeText: string;
  conditions: SearchCondition[];
  contentType?: string;
}
