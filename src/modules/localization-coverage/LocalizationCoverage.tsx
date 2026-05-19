import { useState } from 'react';
import { useSDK } from '@contentful/react-apps-toolkit';
import { useQuery } from '@tanstack/react-query';
import {
  Flex,
  Text,
  Spinner,
  Note,
  Select,
  FormControl,
  Card,
  Tooltip,
} from '@contentful/f36-components';

interface LocaleField {
  [locale: string]: unknown;
}

interface EntryRow {
  id: string;
  title: string;
  contentTypeId: string;
  locales: Record<string, boolean>; // locale → has at least one field value
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

    return { id: entry.sys.id, title, contentTypeId, locales: localeMap };
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

export function LocalizationCoverage() {
  const sdk = useSDK();
  const [selectedCtId, setSelectedCtId] = useState<string>('');

  const { data: meta, isLoading: metaLoading } = useQuery({
    queryKey: ['localization-meta'],
    queryFn: () => fetchLocalizationData(sdk),
  });

  const { data: entries, isLoading: entriesLoading } = useQuery({
    queryKey: ['localization-entries', selectedCtId],
    queryFn: () => fetchEntriesForContentType(sdk, selectedCtId, meta?.locales ?? []),
    enabled: !!selectedCtId && !!meta,
  });

  if (metaLoading) {
    return <Flex paddingTop="spacingXl"><Spinner /></Flex>;
  }

  if (!meta) {
    return <Note variant="negative">Could not load locale information.</Note>;
  }

  const { locales, contentTypes } = meta;

  const coveragePct = (rows: EntryRow[], locale: string) => {
    if (!rows.length) return 0;
    return Math.round((rows.filter((r) => r.locales[locale]).length / rows.length) * 100);
  };

  return (
    <Flex flexDirection="column" gap="spacingM">
      <Flex justifyContent="space-between" alignItems="flex-end">
        <Flex flexDirection="column">
          <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">Localization Coverage</Text>
          <Text fontColor="gray600">
            {locales.length} locale{locales.length !== 1 ? 's' : ''} detected
          </Text>
        </Flex>
        <FormControl style={{ marginBottom: 0 }}>
          <FormControl.Label>Content type</FormControl.Label>
          <Select
            value={selectedCtId}
            onChange={(e) => setSelectedCtId(e.target.value)}
            style={{ minWidth: 220 }}
          >
            <Select.Option value="">Select a content type…</Select.Option>
            {contentTypes.map((ct) => (
              <Select.Option key={ct.sys.id} value={ct.sys.id}>
                {ct.name}
              </Select.Option>
            ))}
          </Select>
        </FormControl>
      </Flex>

      {!selectedCtId && (
        <Note variant="neutral">Select a content type above to view its localization matrix.</Note>
      )}

      {selectedCtId && entriesLoading && (
        <Flex paddingTop="spacingXl"><Spinner /></Flex>
      )}

      {selectedCtId && !entriesLoading && entries && (
        <>
          {/* Summary strip — compact pills, never full-width */}
          <Card padding="default">
            <Flex gap="spacingXl" flexWrap="wrap" alignItems="flex-start">
              {locales.map((locale) => {
                const pct = coveragePct(entries, locale);
                const color = pct === 100 ? '#00C459' : pct >= 50 ? '#F0AB00' : '#E44F20';
                return (
                  <Flex key={locale} flexDirection="column" gap="spacingXs" style={{ minWidth: 80 }}>
                    <Text fontColor="gray500" fontSize="fontSizeS">{locale}</Text>
                    <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeXl" style={{ color }}>
                      {pct}%
                    </Text>
                    <div style={{ height: 4, width: 64, background: '#e5e9ed', borderRadius: 2 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
                    </div>
                  </Flex>
                );
              })}
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
                      <th key={l} style={{ padding: '6px 12px', borderBottom: '2px solid #e5e9ed', textAlign: 'center', fontWeight: 600 }}>
                        {l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((row, i) => (
                    <tr key={row.id} style={{ background: i % 2 === 0 ? '#fff' : '#f7f9fa' }}>
                      <td style={{ padding: '6px 12px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Tooltip content={row.title} placement="top">
                          <span>{row.title}</span>
                        </Tooltip>
                      </td>
                      {locales.map((l) => (
                        <td key={l} style={{ padding: '6px 12px', textAlign: 'center' }}>
                          <CoverageCell covered={row.locales[l]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {entries.length === 100 && (
            <Note variant="neutral">Showing first 100 published entries.</Note>
          )}
        </>
      )}
    </Flex>
  );
}
