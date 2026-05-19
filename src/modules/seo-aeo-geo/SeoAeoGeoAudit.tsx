import { useState } from 'react';
import { useSDK } from '@contentful/react-apps-toolkit';
import { useQuery } from '@tanstack/react-query';
import {
  Flex,
  Text,
  Select,
  FormControl,
  Spinner,
  Note,
  Card,
  Badge,
  Table,
  Tabs,
  Stack,
} from '@contentful/f36-components';

function SimpleProgress({ value }: { value: number }) {
  return (
    <div style={{ height: 6, background: '#e5e9ed', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ width: `${Math.min(100, value)}%`, height: '100%', background: value >= 75 ? '#00C459' : value >= 50 ? '#F0AB00' : '#E44F20', borderRadius: 3 }} />
    </div>
  );
}
import { CheckCircleIcon, XIcon } from '@contentful/f36-icons';
import { scoreSEO, scoreAEO, scoreGEO, type ScoreResult } from './scorer';

interface AuditRow {
  id: string;
  title: string;
  seo: ScoreResult;
  aeo: ScoreResult;
  geo: ScoreResult;
  composite: number;
}

function ScoreBadge({ score }: { score: number }) {
  const variant = score >= 75 ? 'positive' : score >= 50 ? 'warning' : 'negative';
  return <Badge variant={variant}>{score}</Badge>;
}

function ScoreCard({ label, result, color }: { label: string; result: ScoreResult; color: string }) {
  return (
    <Card padding="default" style={{ flex: 1 }}>
      <Flex justifyContent="space-between" alignItems="center" marginBottom="spacingS">
        <Text fontWeight="fontWeightDemiBold">{label}</Text>
        <Text fontSize="fontSizeXl" fontWeight="fontWeightDemiBold" style={{ color }}>
          {result.score}
        </Text>
      </Flex>
      <SimpleProgress value={result.score} />
      <Stack flexDirection="column" spacing="spacingXs">
        {result.passes.map((p) => (
          <Flex key={p} gap="spacingXs" alignItems="flex-start">
            <CheckCircleIcon size="tiny" style={{ color: '#00C459', flexShrink: 0, marginTop: 2 }} />
            <Text fontSize="fontSizeS" fontColor="gray700">{p}</Text>
          </Flex>
        ))}
        {result.issues.map((issue) => (
          <Flex key={issue} gap="spacingXs" alignItems="flex-start">
            <XIcon size="tiny" style={{ color: '#E44F20', flexShrink: 0, marginTop: 2 }} />
            <Text fontSize="fontSizeS" fontColor="gray700">{issue}</Text>
          </Flex>
        ))}
      </Stack>
    </Card>
  );
}

export function SeoAeoGeoAudit() {
  const sdk = useSDK();
  const [contentTypeId, setContentTypeId] = useState('');
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const { data: ctData } = useQuery({
    queryKey: ['seo-content-types'],
    queryFn: async () => {
      const res = await (sdk.cma as any).contentType.getMany({ query: { limit: 200 } });
      return res.items as Array<{ sys: { id: string }; name: string; fields: Array<{ id: string; name: string }> }>;
    },
  });

  const { data: auditRows, isLoading } = useQuery({
    queryKey: ['seo-audit', contentTypeId],
    queryFn: async (): Promise<AuditRow[]> => {
      const localesRes = await (sdk.cma as any).locale.getMany({});
      const defaultLocale: string = localesRes.items.find((l: any) => l.default)?.code ?? localesRes.items[0]?.code ?? 'en-US';

      const res = await (sdk.cma as any).entry.getMany({
        query: { content_type: contentTypeId, limit: 50, 'sys.publishedAt[exists]': true },
      });

      const ct = ctData?.find((c) => c.sys.id === contentTypeId);
      const fieldNames: Record<string, string> = {};
      if (ct) {
        for (const f of ct.fields) {
          fieldNames[f.name.toLowerCase().replace(/\s+/g, '')] = f.id;
          fieldNames[f.id.toLowerCase()] = f.id;
        }
      }

      return res.items.map((entry: any) => {
        const firstField = Object.values(entry.fields)[0] as any;
        const title = firstField ? String(Object.values(firstField)[0] ?? entry.sys.id) : entry.sys.id;
        const seo = scoreSEO(entry.fields, defaultLocale, fieldNames);
        const aeo = scoreAEO(entry.fields, defaultLocale, fieldNames);
        const geo = scoreGEO(entry.fields, defaultLocale, fieldNames);
        const composite = Math.round((seo.score + aeo.score + geo.score) / 3);
        return { id: entry.sys.id, title, seo, aeo, geo, composite };
      });
    },
    enabled: !!contentTypeId && !!ctData,
  });

  const selectedEntry = auditRows?.find((r) => r.id === selectedEntryId);

  return (
    <Flex flexDirection="column" gap="spacingM">
      <Flex justifyContent="space-between" alignItems="flex-end">
        <Flex flexDirection="column">
          <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">SEO / AEO / GEO Audit</Text>
          <Text fontColor="gray600">Score entries across classic SEO, Answer Engine, and Generative Engine signals.</Text>
        </Flex>
        <FormControl style={{ marginBottom: 0, minWidth: 220 }}>
          <FormControl.Label>Content type</FormControl.Label>
          <Select value={contentTypeId} onChange={(e) => { setContentTypeId(e.target.value); setSelectedEntryId(null); }}>
            <Select.Option value="">Select a content type…</Select.Option>
            {ctData?.map((ct) => (
              <Select.Option key={ct.sys.id} value={ct.sys.id}>{ct.name}</Select.Option>
            ))}
          </Select>
        </FormControl>
      </Flex>

      {!contentTypeId && <Note variant="neutral">Select a content type to run the audit.</Note>}
      {contentTypeId && isLoading && <Flex justifyContent="center" paddingTop="spacingXl"><Spinner /></Flex>}

      {auditRows && !isLoading && (
        <Tabs defaultTab="table">
          <Tabs.List>
            <Tabs.Tab panelId="table">Entry list</Tabs.Tab>
            {selectedEntry && <Tabs.Tab panelId="detail">Entry detail</Tabs.Tab>}
          </Tabs.List>

          <Tabs.Panel id="table">
            {auditRows.length === 0 ? (
              <Note variant="neutral">No published entries for this content type.</Note>
            ) : (
              <Table>
                <Table.Head>
                  <Table.Row>
                    <Table.Cell>Entry</Table.Cell>
                    <Table.Cell>SEO</Table.Cell>
                    <Table.Cell>AEO</Table.Cell>
                    <Table.Cell>GEO</Table.Cell>
                    <Table.Cell>Composite</Table.Cell>
                  </Table.Row>
                </Table.Head>
                <Table.Body>
                  {auditRows
                    .sort((a, b) => b.composite - a.composite)
                    .map((row) => (
                      <Table.Row
                        key={row.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedEntryId(row.id)}
                      >
                        <Table.Cell>
                          <Text style={{ color: '#1773EB', textDecoration: 'underline' }}>
                            {row.title}
                          </Text>
                        </Table.Cell>
                        <Table.Cell><ScoreBadge score={row.seo.score} /></Table.Cell>
                        <Table.Cell><ScoreBadge score={row.aeo.score} /></Table.Cell>
                        <Table.Cell><ScoreBadge score={row.geo.score} /></Table.Cell>
                        <Table.Cell><ScoreBadge score={row.composite} /></Table.Cell>
                      </Table.Row>
                    ))}
                </Table.Body>
              </Table>
            )}
          </Tabs.Panel>

          {selectedEntry && (
            <Tabs.Panel id="detail">
              <Flex flexDirection="column" gap="spacingM">
                <Text fontWeight="fontWeightDemiBold">{selectedEntry.title}</Text>
                <Flex gap="spacingM" flexWrap="wrap">
                  <ScoreCard label="SEO" result={selectedEntry.seo} color="#1773EB" />
                  <ScoreCard label="AEO" result={selectedEntry.aeo} color="#8B2EEA" />
                  <ScoreCard label="GEO" result={selectedEntry.geo} color="#00897B" />
                </Flex>
              </Flex>
            </Tabs.Panel>
          )}
        </Tabs>
      )}
    </Flex>
  );
}
