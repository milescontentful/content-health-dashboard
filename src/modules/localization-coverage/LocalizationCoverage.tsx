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
import { extractAiActionId, invokeAiActionAndWait, AiActionNotPermittedError } from '../../lib/aiActions';
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
}

async function fetchLocalizationData(sdk: ReturnType<typeof useSDK>) {
  const [localesRes, contentTypesRes] = await Promise.all([
    (sdk.cma as any).locale.getMany({}),
    (sdk.cma as any).contentType.getMany({ query: { limit: 200 } }),
  ]);

  const locales: string[] = localesRes.items.map((l: any) => l.code);
  const defaultLocale: string = localesRes.items.find((l: any) => l.default)?.code ?? locales[0];
  const contentTypes: Array<{ sys: { id: string }; name: string }> = contentTypesRes.items;

  return { locales, defaultLocale, contentTypes };
}

async function fetchEntriesForContentType(
  sdk: ReturnType<typeof useSDK>,
  contentTypeId: string,
  locales: string[],
): Promise<EntryRow[]> {
  const res = await (sdk.cma as any).entry.getMany({
    query: { content_type: contentTypeId, limit: 100, 'sys.publishedAt[exists]': true },
  });

  return res.items.map((entry: any) => {
    const titleField = Object.values(entry.fields)[0] as LocaleField | undefined;
    const title = titleField
      ? (Object.values(titleField)[0] as string) ?? entry.sys.id
      : entry.sys.id;

    const localeMap: Record<string, boolean> = {};
    for (const locale of locales) {
      const hasValue = Object.values(entry.fields).some((fieldVal: any) => {
        const val = fieldVal?.[locale];
        return val !== undefined && val !== null && val !== '';
      });
      localeMap[locale] = hasValue;
    }

    return { id: entry.sys.id, title, contentTypeId, locales: localeMap, rawFields: entry.fields };
  });
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
  const [aiBlocked, setAiBlocked] = useState(false);;

  const translationActionId = extractAiActionId(installationParams.translationActionId ?? '');
  const spaceId: string = (sdk as any).ids?.space ?? '';
  const environmentId: string = (sdk as any).ids?.environment ?? 'master';

  const { data: meta, isLoading: metaLoading, refetch } = useQuery({
    queryKey: ['localization-meta'],
    queryFn: () => fetchLocalizationData(sdk),
  });

  const { data: entries, isLoading: entriesLoading } = useQuery({
    queryKey: ['localization-entries', selectedCtId],
    queryFn: () => fetchEntriesForContentType(sdk, selectedCtId, meta?.locales ?? []),
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
      // Invoke the AI Action — it maps variable types automatically and polls until done.
      // The action is expected to write translated fields directly back to the entry.
      await invokeAiActionAndWait(
        sdk.cma,
        spaceId,
        environmentId,
        translationActionId,
        { entryId, targetLocale, sourceLocale },
      );

      await queryClient.invalidateQueries({ queryKey: ['localization-entries', selectedCtId] });
      sdk.notifier.success(`Translated entry to ${targetLocale}`);
    } catch (err: any) {
      if (err instanceof AiActionNotPermittedError) {
        setAiBlocked(true);
        openEntryInNewTab(spaceId, environmentId, entryId);
      } else {
        setTranslateErrors((e) => ({ ...e, [key]: err?.message ?? 'Translation failed.' }));
      }
    } finally {
      setTranslating((t) => { const n = { ...t }; delete n[key]; return n; });
    }
  }, [sdk, translationActionId, spaceId, environmentId, selectedCtId, queryClient]);

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

  const { locales, defaultLocale, contentTypes } = meta;

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

      {/* AI Actions blocked banner */}
      {aiBlocked && (
        <Note variant="warning">
          <Flex justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="spacingS">
            <Text fontSize="fontSizeS">
              <strong>AI Actions cannot be invoked directly from a Contentful App</strong> — the entry was opened in a new tab so you can use the native <strong>Translate</strong> button there.
              For full in-app automation, this would require an <a href="https://www.contentful.com/developers/docs/extensibility/app-framework/app-functions/" target="_blank" rel="noopener noreferrer" style={{ color: '#1773EB' }}>App Function</a> backend.
            </Text>
            <Button variant="transparent" size="small" onClick={() => setAiBlocked(false)}>Dismiss</Button>
          </Flex>
        </Note>
      )}

      {/* AI Actions banner */}
      {!translationActionId && (
        <Note variant="neutral">
          <Flex justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="spacingS">
            <Text fontSize="fontSizeS">
              <strong>Translation AI Actions available.</strong> Configure a Contentful AI Action to add one-click translation directly from this heatmap.
              Contentful's{' '}
              <a href="https://www.contentful.com/marketplace/" target="_blank" rel="noopener noreferrer" style={{ color: '#1773EB' }}>
                Marketplace
              </a>{' '}
              has translation apps that expose App Actions.
            </Text>
            <Badge variant="secondary">Config Screen → AI Audit → Translation</Badge>
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
                    {translationActionId && (
                      <th style={{ padding: '6px 12px', borderBottom: '2px solid #e5e9ed', textAlign: 'left', fontWeight: 600, minWidth: 120 }}>
                        Translate
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((row, i) => {
                    const missingLocales = locales.filter((l) => l !== defaultLocale && !row.locales[l]);
                    const anyTranslating = missingLocales.some((l) => translating[`${row.id}-${l}`]);
                    const rowError = missingLocales.map((l) => translateErrors[`${row.id}-${l}`]).find(Boolean);

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
                        {translationActionId && (
                          <td style={{ padding: '6px 8px' }}>
                            {missingLocales.length === 0 ? (
                              <Badge variant="positive">Complete</Badge>
                            ) : anyTranslating ? (
                              <Flex gap="spacingXs" alignItems="center">
                                <Spinner size="small" />
                                <Text fontSize="fontSizeS" fontColor="gray500">Translating…</Text>
                              </Flex>
                            ) : missingLocales.length === 1 ? (
                              <Flex gap="spacingXs" alignItems="center">
                                {rowError && (
                                  <Tooltip content={rowError} placement="top">
                                    <Text fontSize="fontSizeS" style={{ color: '#E44F20' }}>Error</Text>
                                  </Tooltip>
                                )}
                                <Button
                                  variant="secondary"
                                  size="small"
                                  onClick={() => handleTranslate(row.id, missingLocales[0], defaultLocale)}
                                >
                                  Translate → {missingLocales[0]} ✦
                                </Button>
                              </Flex>
                            ) : (
                              <Flex gap="spacingXs" alignItems="center" flexWrap="wrap">
                                {rowError && (
                                  <Tooltip content={rowError} placement="top">
                                    <Text fontSize="fontSizeS" style={{ color: '#E44F20' }}>Error</Text>
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
                              </Flex>
                            )}
                          </td>
                        )}
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
                Translate buttons save changes as drafts — review and publish when ready.
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
