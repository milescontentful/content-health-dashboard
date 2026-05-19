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
  Button,
} from '@contentful/f36-components';
import { CheckCircleIcon, XIcon, DownloadSimpleIcon } from '@contentful/f36-icons';
import { downloadCsv, formatDateForCsv } from '../../lib/csv';
import { openEntryInNewTab } from '../../lib/openInNewTab';
import { scoreSEO, scoreAEO, scoreGEO, type ScoreResult } from './scorer';

function SimpleProgress({ value }: { value: number }) {
  return (
    <div style={{ height: 6, background: '#e5e9ed', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
      <div style={{ width: `${Math.min(100, value)}%`, height: '100%', background: value >= 75 ? '#00C459' : value >= 50 ? '#F0AB00' : '#E44F20', borderRadius: 3 }} />
    </div>
  );
}

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
    <Card padding="default" style={{ flex: 1, minWidth: 260 }}>
      <Flex justifyContent="space-between" alignItems="center" marginBottom="spacingXs">
        <Text fontWeight="fontWeightDemiBold">{label}</Text>
        <Text fontSize="fontSizeXl" fontWeight="fontWeightDemiBold" style={{ color }}>
          {result.score}<Text as="span" fontColor="gray500" fontSize="fontSizeS">/100</Text>
        </Text>
      </Flex>
      <SimpleProgress value={result.score} />
      <Stack flexDirection="column" spacing="spacingXs" alignItems="flex-start">
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

// ─── Scoring rubric legend ────────────────────────────────────────────────────

const RUBRIC = [
  {
    label: 'SEO',
    color: '#1773EB',
    checks: [
      'Title field present',
      'Title 40–65 characters',
      'Meta/SEO description field present',
      'Description 120–160 characters',
      'Slug or URL path field present',
      'Content body ≥ 300 characters',
      'Content has ≥ 4 sentences',
    ],
  },
  {
    label: 'AEO',
    color: '#8B2EEA',
    checks: [
      'Question-style phrases (who/what/when/where/why/how)',
      'Substantive opening statement (≥ 60 chars)',
      'Numbered or bullet list detected',
      'Definitional language ("X is a…", "defined as…")',
      'FAQ section or FAQ-style content',
      'Content ≥ 500 characters',
    ],
  },
  {
    label: 'GEO',
    color: '#00897B',
    checks: [
      'Brand or organisation field present',
      'Structured data terminology (schema, JSON-LD, OG…)',
      'Conversational tone ("you", "your")',
      'Citable statistics (numbers + % or magnitude)',
      'Clear subject established in first 100 characters',
      'Recent year reference (2024–2030)',
      'Authoritative length ≥ 800 characters',
    ],
  },
];

function ScoringRubric() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1773EB', fontSize: 13, padding: 0, marginBottom: 8 }}
      >
        {open ? '▲ Hide' : '▼ How scores are calculated'}
      </button>
      {open && (
        <Card padding="default" style={{ marginBottom: 16 }}>
          <Text fontWeight="fontWeightDemiBold" marginBottom="spacingS" as="p">Scoring rubric — each check = equal weight</Text>
          <Flex gap="spacingL" flexWrap="wrap" alignItems="flex-start">
            {RUBRIC.map((r) => (
              <Flex key={r.label} flexDirection="column" gap="spacingXs" style={{ minWidth: 220 }}>
                <Text fontWeight="fontWeightDemiBold" style={{ color: r.color }}>{r.label} — {r.checks.length} checks</Text>
                {r.checks.map((c, i) => (
                  <Text key={i} fontSize="fontSizeS" fontColor="gray700">• {c}</Text>
                ))}
              </Flex>
            ))}
            <Flex flexDirection="column" gap="spacingXs" style={{ minWidth: 160 }}>
              <Text fontWeight="fontWeightDemiBold">Score bands</Text>
              <Flex gap="spacingXs" alignItems="center">
                <div style={{ width: 12, height: 12, borderRadius: 3, background: '#00C459' }} />
                <Text fontSize="fontSizeS">75–100 — Strong</Text>
              </Flex>
              <Flex gap="spacingXs" alignItems="center">
                <div style={{ width: 12, height: 12, borderRadius: 3, background: '#F0AB00' }} />
                <Text fontSize="fontSizeS">50–74 — Needs improvement</Text>
              </Flex>
              <Flex gap="spacingXs" alignItems="center">
                <div style={{ width: 12, height: 12, borderRadius: 3, background: '#E44F20' }} />
                <Text fontSize="fontSizeS">0–49 — Poor</Text>
              </Flex>
            </Flex>
          </Flex>
        </Card>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

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

  const handleExport = () => {
    if (!auditRows) return;
    const headers = ['Entry ID', 'Title', 'SEO Score', 'AEO Score', 'GEO Score', 'Composite', 'SEO Issues', 'AEO Issues', 'GEO Issues'];
    const rows = auditRows.map((r) => [
      r.id, r.title, r.seo.score, r.aeo.score, r.geo.score, r.composite,
      r.seo.issues.join('; '), r.aeo.issues.join('; '), r.geo.issues.join('; '),
    ]);
    downloadCsv(`seo-aeo-geo-audit-${formatDateForCsv(new Date()).replace(/[ :]/g, '-')}.csv`, headers, rows);
  };

  return (
    <Flex flexDirection="column" gap="spacingM">
      {/* Header row */}
      <Flex justifyContent="space-between" alignItems="flex-start">
        <Flex flexDirection="column" gap="spacingXs">
          <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">SEO / AEO / GEO Audit</Text>
          <Text fontColor="gray600" fontSize="fontSizeS">
            Score published entries across classic SEO, Answer Engine, and Generative Engine signals.
          </Text>
        </Flex>
        {auditRows && auditRows.length > 0 && (
          <Button variant="secondary" size="small" startIcon={<DownloadSimpleIcon />} onClick={handleExport}>
            Export CSV
          </Button>
        )}
      </Flex>

      {/* Content type picker */}
      <Flex gap="spacingM" alignItems="flex-end">
        <FormControl style={{ marginBottom: 0, minWidth: 220 }}>
          <FormControl.Label>Content type</FormControl.Label>
          <Select
            value={contentTypeId}
            onChange={(e) => { setContentTypeId(e.target.value); setSelectedEntryId(null); }}
          >
            <Select.Option value="">Select a content type…</Select.Option>
            {ctData?.map((ct) => (
              <Select.Option key={ct.sys.id} value={ct.sys.id}>{ct.name}</Select.Option>
            ))}
          </Select>
        </FormControl>
      </Flex>

      <ScoringRubric />

      {!contentTypeId && <Note variant="neutral">Select a content type above to run the audit.</Note>}
      {contentTypeId && isLoading && <Flex paddingTop="spacingXl"><Spinner /></Flex>}

      {auditRows && !isLoading && (
        <Tabs defaultTab={selectedEntry ? 'detail' : 'table'}>
          <Tabs.List>
            <Tabs.Tab panelId="table">Entry list</Tabs.Tab>
            {selectedEntry && <Tabs.Tab panelId="detail">↳ {selectedEntry.title.slice(0, 30)}{selectedEntry.title.length > 30 ? '…' : ''}</Tabs.Tab>}
          </Tabs.List>

          <Tabs.Panel id="table">
            {auditRows.length === 0 ? (
              <Note variant="neutral">No published entries for this content type.</Note>
            ) : (
              <>
                <Text fontColor="gray500" fontSize="fontSizeS" marginBottom="spacingS" as="p">
                  Click an entry to see its full scorecard breakdown. Showing up to 50 published entries, sorted by composite score.
                </Text>
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
                    {[...auditRows]
                      .sort((a, b) => b.composite - a.composite)
                      .map((row) => (
                        <Table.Row
                          key={row.id}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelectedEntryId(row.id)}
                        >
                          <Table.Cell>
                            <Flex alignItems="center" gap="spacingXs">
                              <Text style={{ color: '#1773EB', textDecoration: 'underline' }}>
                                {row.title}
                              </Text>
                              <Text
                                as="span"
                                style={{ color: '#8c9bab', fontSize: 11 }}
                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); openEntryInNewTab((sdk as any).ids.space, (sdk as any).ids.environment, row.id); }}
                              >
                                ↗
                              </Text>
                            </Flex>
                          </Table.Cell>
                          <Table.Cell><ScoreBadge score={row.seo.score} /></Table.Cell>
                          <Table.Cell><ScoreBadge score={row.aeo.score} /></Table.Cell>
                          <Table.Cell><ScoreBadge score={row.geo.score} /></Table.Cell>
                          <Table.Cell><ScoreBadge score={row.composite} /></Table.Cell>
                        </Table.Row>
                      ))}
                  </Table.Body>
                </Table>
              </>
            )}
          </Tabs.Panel>

          {selectedEntry && (
            <Tabs.Panel id="detail">
              <Flex flexDirection="column" gap="spacingM">
                <Flex justifyContent="space-between" alignItems="center">
                  <Flex alignItems="center" gap="spacingS">
                    <Text fontWeight="fontWeightDemiBold">{selectedEntry.title}</Text>
                    <Text
                      style={{ cursor: 'pointer', color: '#1773EB', fontSize: 13 }}
                      onClick={() => openEntryInNewTab((sdk as any).ids.space, (sdk as any).ids.environment, selectedEntry.id)}
                    >
                      ↗ Open entry
                    </Text>
                  </Flex>
                  <Text
                    style={{ cursor: 'pointer', color: '#1773EB', fontSize: 13 }}
                    onClick={() => setSelectedEntryId(null)}
                  >
                    ← Back to list
                  </Text>
                </Flex>
                <Flex gap="spacingM" flexWrap="wrap" alignItems="flex-start">
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
