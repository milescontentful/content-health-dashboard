import { useState, useCallback } from 'react';
import { useSDK } from '@contentful/react-apps-toolkit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Flex,
  Text,
  Spinner,
  Note,
  Select,
  FormControl,
  Badge,
  Card,
  Tooltip,
  Button,
  Menu,
} from '@contentful/f36-components';
import { openEntryInNewTab } from '../../lib/openInNewTab';
import { invokeAppActionAndWait } from '../../lib/aiActions';
import { APP_ACTION_IDS } from '../../lib/appActions';
import type { ModuleProps } from '../types';

interface LocaleField {
  [locale: string]: unknown;
}

interface EntryRow {
  id: string;
  title: string;
  contentTypeId: string;
  locales: Record<string, boolean>;
  rawFields: Record<string, Record<string, unknown>>;
  publishedVersion: number | undefined;
  updatedVersion: number;
}

interface ContentTypeField {
  id: string;
  name: string;
  type: string;
  localized: boolean;
}

interface ContentTypeMeta {
  sys: { id: string };
  name: string;
  fields: ContentTypeField[];
}

async function fetchLocalizationData(sdk: ReturnType<typeof useSDK>) {
  const [localesRes, contentTypesRes] = await Promise.all([
    (sdk.cma as any).locale.getMany({}),
    (sdk.cma as any).contentType.getMany({ query: { limit: 200 } }),
  ]);

  const locales: string[] = localesRes.items.map((l: any) => l.code);
  const defaultLocale: string = localesRes.items.find((l: any) => l.default)?.code ?? locales[0];

  const allContentTypes: ContentTypeMeta[] = contentTypesRes.items;
  const contentTypes = allContentTypes
    .filter((ct) => ct.fields.some((f) => f.localized))
    .sort((a, b) => a.name.localeCompare(b.name));
  const nonLocalizedTypes = allContentTypes
    .filter((ct) => !ct.fields.some((f) => f.localized))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { locales, defaultLocale, contentTypes, nonLocalizedTypes };
}

async function fetchEntriesForContentType(
  sdk: ReturnType<typeof useSDK>,
  contentTypeId: string,
  locales: string[],
  defaultLocale: string,
): Promise<EntryRow[]> {
  const [res, ct] = await Promise.all([
    (sdk.cma as any).entry.getMany({
      query: { content_type: contentTypeId, limit: 100, 'sys.publishedAt[exists]': true },
    }),
    (sdk.cma as any).contentType.get({ contentTypeId }),
  ]);

  // Only consider fields that have localization enabled in the content model
  const localizableFieldIds = new Set<string>(
    (ct.fields as ContentTypeField[]).filter(f => f.localized).map(f => f.id)
  );

  // Display field (first field declared on the content type) for title resolution
  const displayFieldId: string | undefined = (ct as any).displayField;

  const rows: EntryRow[] = res.items.map((entry: any) => {
    // Resolve title: prefer en-US → defaultLocale → first available value
    const titleRaw = displayFieldId
      ? (entry.fields[displayFieldId] as LocaleField | undefined)
      : (Object.values(entry.fields)[0] as LocaleField | undefined);
    const title: string =
      (titleRaw?.['en-US'] as string | undefined) ??
      (titleRaw?.[defaultLocale] as string | undefined) ??
      (titleRaw ? (Object.values(titleRaw)[0] as string) : undefined) ??
      entry.sys.id;

    const localeMap: Record<string, boolean> = {};
    for (const locale of locales) {
      const hasValue = [...localizableFieldIds].some((fieldId) => {
        const val = (entry.fields[fieldId] as any)?.[locale];
        return val !== undefined && val !== null && val !== '';
      });
      localeMap[locale] = hasValue;
    }

    return {
      id: entry.sys.id,
      title,
      contentTypeId,
      locales: localeMap,
      rawFields: entry.fields,
      publishedVersion: entry.sys.publishedVersion,
      updatedVersion: entry.sys.version,
    };
  });

  // Sort alphabetically by resolved (en-US) title
  return rows.sort((a, b) => a.title.localeCompare(b.title, 'en'));
}

function CoverageCell({ covered }: { covered: boolean }) {
  return (
    <div
      style={{
        width: 20,
        height: 20,
        borderRadius: 4,
        background: covered ? '#00C459' : '#f7f9fa',
        border: covered ? '1px solid #00a04a' : '1px solid #cfd9e0',
        display: 'inline-block',
      }}
    />
  );
}

export function LocalizationCoverage({ installationParams }: ModuleProps) {
  const sdk = useSDK();
  const queryClient = useQueryClient();
  const [selectedCtId, setSelectedCtId] = useState<string>('');
  const [translating, setTranslating] = useState<Record<string, boolean>>({});
  const [translateErrors, setTranslateErrors] = useState<Record<string, string>>({});
  const [publishing, setPublishing] = useState<Record<string, boolean>>({});
  const [showNonLocalized, setShowNonLocalized] = useState(false);

  const translationActionId = (installationParams.translationActionId ?? '').trim();
  const appId: string = (sdk as any).ids?.app ?? '';
  const spaceId: string = (sdk as any).ids?.space ?? '';
  const environmentId: string = (sdk as any).ids?.environment ?? 'master';

  const { data: meta, isLoading: metaLoading, refetch } = useQuery({
    queryKey: ['localization-meta'],
    queryFn: () => fetchLocalizationData(sdk),
  });

  const { data: entries, isLoading: entriesLoading } = useQuery({
    queryKey: ['localization-entries', selectedCtId],
    queryFn: () => fetchEntriesForContentType(sdk, selectedCtId, meta?.locales ?? [], meta?.defaultLocale ?? 'en-US'),
    enabled: !!selectedCtId && !!meta,
  });

  const handleTranslate = useCallback(async (
    entryId: string,
    targetLocale: string,
    sourceLocale: string,
  ) => {
    const key = `${entryId}-${targetLocale}`;
    setTranslating((t) => ({ ...t, [key]: true }));
    setTranslateErrors((e) => { const n = { ...e }; delete n[key]; return n; });

    try {
      // The translateFields App Function handles everything server-side:
      // fetches the entry, filters to localizable text fields, calls the AI Action
      // once per field (passing the field text as the Content variable), and writes
      // the translations back to the entry as a draft before returning.
      const result = await invokeAppActionAndWait<{ translatedCount: number; skippedCount: number; error?: string }>(
        sdk.cma,
        appId,
        APP_ACTION_IDS.translateFields,
        { entryId, sourceLocale, targetLocale, aiActionId: translationActionId },
      );

      if (result.error) throw new Error(result.error);

      await queryClient.invalidateQueries({ queryKey: ['localization-entries', selectedCtId] });
      sdk.notifier.success(
        `Translated ${result.translatedCount} field(s) to ${targetLocale}` +
        (result.skippedCount > 0 ? ` (${result.skippedCount} skipped)` : ''),
      );
    } catch (err: any) {
      setTranslateErrors((e) => ({ ...e, [key]: err?.message ?? 'Translation failed.' }));
    } finally {
      setTranslating((t) => { const n = { ...t }; delete n[key]; return n; });
    }
  }, [sdk, translationActionId, appId, spaceId, environmentId, selectedCtId, queryClient]);

  const handlePublish = useCallback(async (entryId: string) => {
    setPublishing((p) => ({ ...p, [entryId]: true }));
    try {
      const entry = await (sdk.cma as any).entry.get({ entryId, spaceId, environmentId });
      await (sdk.cma as any).entry.publish({ entryId, spaceId, environmentId }, entry);
      await queryClient.invalidateQueries({ queryKey: ['localization-entries', selectedCtId] });
      sdk.notifier.success('Entry published.');
    } catch (err: any) {
      sdk.notifier.error(err?.message ?? 'Publish failed.');
    } finally {
      setPublishing((p) => { const n = { ...p }; delete n[entryId]; return n; });
    }
  }, [sdk, spaceId, environmentId, selectedCtId, queryClient]);

  if (metaLoading) {
    return (
      <Flex flexDirection="column" gap="spacingM">
        <Flex justifyContent="space-between" alignItems="flex-start">
          <Flex flexDirection="column" gap="spacingXs">
            <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">Localization Coverage</Text>
            <Text fontColor="gray600" fontSize="fontSizeS">Heatmap of entries × locales. Quickly spot missing translations and coverage gaps.</Text>
          </Flex>
        </Flex>
        <Flex gap="spacingS" alignItems="center" paddingTop="spacingL">
          <Spinner />
          <Text fontColor="gray500" fontSize="fontSizeS">Loading locale configuration…</Text>
        </Flex>
      </Flex>
    );
  }

  if (!meta) return <Note variant="negative">Could not load locale information.</Note>;

  const { locales, defaultLocale, contentTypes, nonLocalizedTypes } = meta;

  const coveragePct = (rows: EntryRow[], locale: string) => {
    if (!rows.length) return 0;
    return Math.round((rows.filter((r) => r.locales[locale]).length / rows.length) * 100);
  };

  return (
    <Flex flexDirection="column" gap="spacingM">
      {/* Header */}
      <Flex justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap="spacingM">
        <Flex flexDirection="column" gap="spacingXs">
          <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">Localization Coverage</Text>
          <Text fontColor="gray600" fontSize="fontSizeS">
            Heatmap of entries × locales. {locales.length} locale{locales.length !== 1 ? 's' : ''} detected in this space.
          </Text>
        </Flex>
        <Flex gap="spacingS" alignItems="flex-end">
          <FormControl style={{ marginBottom: 0 }}>
            <FormControl.Label>Content type</FormControl.Label>
            <Select
              value={selectedCtId}
              onChange={(e) => setSelectedCtId(e.target.value)}
              style={{ minWidth: 220 }}
            >
              <Select.Option value="">Select a content type…</Select.Option>
              {contentTypes.map((ct) => (
                <Select.Option key={ct.sys.id} value={ct.sys.id}>{ct.name}</Select.Option>
              ))}
            </Select>
          </FormControl>
          <Button variant="secondary" size="small" onClick={() => { setSelectedCtId(''); refetch(); }}>Refresh</Button>
        </Flex>
      </Flex>

      {/* Non-localized content types disclosure */}
      {nonLocalizedTypes.length > 0 && (
        <div>
          <button
            onClick={() => setShowNonLocalized((v) => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6f7e8c', fontSize: 12, padding: 0 }}
          >
            {showNonLocalized ? '▲ Hide' : '▼ Show'} {nonLocalizedTypes.length} content type{nonLocalizedTypes.length !== 1 ? 's' : ''} without localization enabled
          </button>
          {showNonLocalized && (
            <Note variant="neutral" style={{ marginTop: 8 }}>
              <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeS" as="p" marginBottom="spacing2Xs">
                No localized fields — not shown in dropdown
              </Text>
              <Text fontSize="fontSizeS" fontColor="gray600">
                {nonLocalizedTypes.map((ct) => ct.name).join(', ')}
              </Text>
              <Text fontSize="fontSizeS" fontColor="gray500" as="p" marginTop="spacing2Xs">
                To enable translation for a content type, mark at least one field as "Localizable" in the Content Model editor.
              </Text>
            </Note>
          )}
        </div>
      )}

      {/* App Functions banner */}
      {!translationActionId && (
        <Note variant="neutral">
          <Flex justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="spacingS">
            <Text fontSize="fontSizeS">
              <strong>Translation available via App Functions.</strong> Upload the app bundle and configure the{' '}
              <code>translate-fields</code> App Action to add one-click translation to this heatmap.
            </Text>
            <Badge variant="secondary">Config Screen → App Functions</Badge>
          </Flex>
        </Note>
      )}

      {!selectedCtId && (
        <Note variant="neutral">Select a content type above to view its localization matrix.</Note>
      )}

      {selectedCtId && entriesLoading && (
        <Flex gap="spacingS" alignItems="center" paddingTop="spacingL">
          <Spinner />
          <Text fontColor="gray500" fontSize="fontSizeS">Loading entries…</Text>
        </Flex>
      )}

      {selectedCtId && !entriesLoading && entries && (
        <>
          {/* Summary strip */}
          <Card padding="default">
            <Flex gap="spacingXl" flexWrap="wrap" alignItems="flex-start">
              {locales.map((locale) => {
                const pct = coveragePct(entries, locale);
                const color = pct === 100 ? '#00C459' : pct >= 50 ? '#F0AB00' : '#E44F20';
                return (
                  <Flex key={locale} flexDirection="column" gap="spacingXs" style={{ minWidth: 80 }}>
                    <Text fontColor="gray500" fontSize="fontSizeS">{locale}</Text>
                    <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeXl" style={{ color }}>{pct}%</Text>
                    <div style={{ height: 4, width: 64, background: '#e5e9ed', borderRadius: 2 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
                    </div>
                  </Flex>
                );
              })}
              <Flex flexDirection="column" gap="spacingXs" style={{ marginLeft: 'auto' }}>
                <Text fontColor="gray500" fontSize="fontSizeS">Source locale</Text>
                <Badge variant="secondary">{defaultLocale}</Badge>
              </Flex>
            </Flex>
          </Card>

          {/* Heatmap table */}
          {entries.length === 0 ? (
            <Note variant="neutral">No published entries found for this content type.</Note>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '6px 12px', borderBottom: '2px solid #e5e9ed', fontWeight: 600 }}>
                      Entry
                    </th>
                    {locales.map((l) => (
                      <th key={l} style={{ padding: '6px 12px', borderBottom: '2px solid #e5e9ed', textAlign: 'center', fontWeight: 600, minWidth: 80 }}>
                        {l}
                      </th>
                    ))}
                    <th style={{ padding: '6px 12px', borderBottom: '2px solid #e5e9ed', textAlign: 'left', fontWeight: 600, minWidth: 220 }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((row, i) => {
                    const missingLocales = locales.filter((l) => l !== defaultLocale && !row.locales[l]);
                    const anyTranslating = missingLocales.some((l) => translating[`${row.id}-${l}`]);
                    const rowError = missingLocales.map((l) => translateErrors[`${row.id}-${l}`]).find(Boolean);
                    const isDraft = row.publishedVersion === undefined;
                    const hasUnpublishedChanges = !isDraft && row.updatedVersion > row.publishedVersion! + 1;
                    const isPublishing = publishing[row.id];

                    return (
                      <tr key={row.id} style={{ background: i % 2 === 0 ? '#fff' : '#f7f9fa' }}>
                        <td style={{ padding: '6px 12px', maxWidth: 280 }}>
                          <Tooltip content={`Open "${row.title}" in new tab`} placement="top">
                            <span
                              style={{ color: '#1773EB', cursor: 'pointer', textDecoration: 'underline', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              onClick={() => openEntryInNewTab(spaceId, environmentId, row.id)}
                            >
                              {row.title}
                            </span>
                          </Tooltip>
                        </td>
                        {locales.map((l) => (
                          <td key={l} style={{ padding: '6px 12px', textAlign: 'center' }}>
                            {translating[`${row.id}-${l}`]
                              ? <Spinner size="small" />
                              : <CoverageCell covered={row.locales[l]} />
                            }
                          </td>
                        ))}
                        {/* Unified Actions column: [status badge] [translate] [publish] — all one row */}
                        <td style={{ padding: '6px 8px' }}>
                          {isPublishing ? (
                            <Flex gap="spacingXs" alignItems="center">
                              <Spinner size="small" />
                              <Text fontSize="fontSizeS" fontColor="gray500">Publishing…</Text>
                            </Flex>
                          ) : (
                            <Flex gap="spacingXs" alignItems="center" flexWrap="wrap">
                              {/* 1 — Status badge */}
                              {isDraft ? (
                                <Badge variant="warning">Draft</Badge>
                              ) : hasUnpublishedChanges ? (
                                <Badge variant="warning">Changed</Badge>
                              ) : (
                                <Badge variant="positive">Published</Badge>
                              )}

                              {/* 2 — Translate (only when action ID configured and locales missing) */}
                              {translationActionId && missingLocales.length > 0 && (
                                anyTranslating ? (
                                  <Flex gap="spacingXs" alignItems="center">
                                    <Spinner size="small" />
                                    <Text fontSize="fontSizeS" fontColor="gray500">Translating…</Text>
                                  </Flex>
                                ) : missingLocales.length === 1 ? (
                                  <>
                                    {rowError && (
                                      <Tooltip content={rowError} placement="top">
                                        <Text fontSize="fontSizeS" style={{ color: '#E44F20' }}>⚠</Text>
                                      </Tooltip>
                                    )}
                                    <Button
                                      variant="secondary"
                                      size="small"
                                      onClick={() => handleTranslate(row.id, missingLocales[0], defaultLocale)}
                                    >
                                      Translate → {missingLocales[0]} ✦
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    {rowError && (
                                      <Tooltip content={rowError} placement="top">
                                        <Text fontSize="fontSizeS" style={{ color: '#E44F20' }}>⚠</Text>
                                      </Tooltip>
                                    )}
                                    <Menu>
                                      <Menu.Trigger>
                                        <Button variant="secondary" size="small">
                                          Translate ({missingLocales.length}) ✦
                                        </Button>
                                      </Menu.Trigger>
                                      <Menu.List>
                                        {missingLocales.map((l) => (
                                          <Menu.Item key={l} onClick={() => handleTranslate(row.id, l, defaultLocale)}>
                                            → {l}
                                          </Menu.Item>
                                        ))}
                                        <Menu.Divider />
                                        <Menu.Item onClick={() => missingLocales.forEach((l) => handleTranslate(row.id, l, defaultLocale))}>
                                          Translate all missing
                                        </Menu.Item>
                                      </Menu.List>
                                    </Menu>
                                  </>
                                )
                              )}

                              {/* 3 — Publish / Re-publish */}
                              {(isDraft || hasUnpublishedChanges) ? (
                                <Button variant="secondary" size="small" onClick={() => handlePublish(row.id)}>
                                  Publish
                                </Button>
                              ) : missingLocales.length > 0 ? (
                                <Button variant="secondary" size="small" onClick={() => handlePublish(row.id)}>
                                  Re-publish
                                </Button>
                              ) : null}
                            </Flex>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {translationActionId && entries.some((e) => locales.some((l) => l !== defaultLocale && !e.locales[l])) && (
            <Note variant="neutral">
              <Text fontSize="fontSizeS">
                Translate saves a draft — use <strong>Publish</strong> (or <strong>Re-publish</strong>) in the same row to push the translation live.
              </Text>
            </Note>
          )}

          {entries.length === 100 && (
            <Note variant="neutral">Showing first 100 published entries.</Note>
          )}
        </>
      )}
    </Flex>
  );
}
