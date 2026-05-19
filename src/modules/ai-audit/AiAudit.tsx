/**
 * AI Content Audit module — calls Contentful AI Actions to grade content quality.
 *
 * Setup required:
 *  1. Create an App Action in your app definition with type "endpoint"
 *     and an action ID like "grade-content".
 *  2. The action handler should accept { entryId, title, body } and return
 *     { score: number, summary: string, suggestions: string[] }
 *  3. Set the App Action ID in the Config Screen (saved to installation params).
 *
 * Docs: https://www.contentful.com/developers/docs/extensibility/app-framework/app-actions/
 */
import { useState, useCallback } from 'react';
import { useSDK } from '@contentful/react-apps-toolkit';
import { useQuery } from '@tanstack/react-query';
import {
  Flex,
  Text,
  Select,
  FormControl,
  Note,
  Card,
  Badge,
  Table,
  Button,
  Stack,
} from '@contentful/f36-components';
import { DownloadSimpleIcon, OpenAiLogoIcon, CheckCircleIcon } from '@contentful/f36-icons';
import { downloadCsv, formatDateForCsv } from '../../lib/csv';
import type { ModuleProps } from '../types';

interface GradeResult {
  entryId: string;
  title: string;
  score: number;
  summary: string;
  suggestions: string[];
  status: 'done' | 'error' | 'skipped';
  error?: string;
}

function ScoreBadge({ score }: { score: number }) {
  const variant = score >= 75 ? 'positive' : score >= 50 ? 'warning' : 'negative';
  return <Badge variant={variant}>{score}</Badge>;
}

function SimpleProgress({ value }: { value: number }) {
  const color = value >= 75 ? '#00C459' : value >= 50 ? '#F0AB00' : '#E44F20';
  return (
    <div style={{ height: 6, background: '#e5e9ed', borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
      <div style={{ width: `${Math.min(100, value)}%`, height: '100%', background: color, borderRadius: 3 }} />
    </div>
  );
}

function SetupGuide({ appId }: { appId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Note variant="warning">
      <Flex flexDirection="column" gap="spacingS">
        <Text fontWeight="fontWeightDemiBold">AI Action not configured</Text>
        <Text fontSize="fontSizeS">
          This module calls a Contentful AI Action to grade content quality. Follow the setup steps below to enable it.
        </Text>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1773EB', fontSize: 13, padding: 0, textAlign: 'left' }}
        >
          {open ? '▲ Hide setup steps' : '▼ Show setup steps'}
        </button>
        {open && (
          <Stack flexDirection="column" spacing="spacingXs" style={{ borderLeft: '3px solid #F0AB00', paddingLeft: 12 }}>
            <Text fontSize="fontSizeS" fontWeight="fontWeightDemiBold">1. Create an App Action</Text>
            <Text fontSize="fontSizeS">
              In your App Definition, add an action with ID <code>grade-content</code> (type: endpoint).
              The action URL should point to your function handler.
            </Text>
            <Text fontSize="fontSizeS" fontWeight="fontWeightDemiBold">2. Deploy a function handler</Text>
            <Text fontSize="fontSizeS">
              The handler receives <code>{'{ entryId, title, body, contentType }'}</code> and must return{' '}
              <code>{'{ score: number, summary: string, suggestions: string[] }'}</code>.
              You can use Contentful App Functions or an external endpoint.
            </Text>
            <Text fontSize="fontSizeS" fontWeight="fontWeightDemiBold">3. Set the App ID and Action ID</Text>
            <Text fontSize="fontSizeS">
              Go to <strong>Config Screen → AI Audit</strong> and enter:
              <br />• App Definition ID: <code style={{ background: '#f1f3f4', padding: '1px 4px' }}>{appId || '<your-app-def-id>'}</code>
              <br />• Action ID: <code style={{ background: '#f1f3f4', padding: '1px 4px' }}>grade-content</code>
            </Text>
            <Text fontSize="fontSizeS" fontWeight="fontWeightDemiBold">4. Docs</Text>
            <Text fontSize="fontSizeS">
              <a href="https://www.contentful.com/developers/docs/extensibility/app-framework/app-actions/" target="_blank" rel="noopener noreferrer" style={{ color: '#1773EB' }}>
                App Actions documentation →
              </a>
            </Text>
          </Stack>
        )}
      </Flex>
    </Note>
  );
}

export function AiAudit({ installationParams }: ModuleProps) {
  const sdk = useSDK();
  const [contentTypeId, setContentTypeId] = useState('');
  const [titleField, setTitleField] = useState('');
  const [bodyField, setBodyField] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<GradeResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<GradeResult | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const actionId: string = (installationParams as any).aiActionId ?? '';
  const appId: string = (sdk as any).ids?.app ?? '';

  const { data: ctData } = useQuery({
    queryKey: ['ai-audit-content-types'],
    queryFn: async () => {
      const res = await (sdk.cma as any).contentType.getMany({ query: { limit: 200 } });
      return res.items as Array<{ sys: { id: string }; name: string; fields: Array<{ id: string; name: string; type: string }> }>;
    },
  });

  const selectedCt = ctData?.find((ct) => ct.sys.id === contentTypeId);
  const textFields = selectedCt?.fields.filter((f) => ['Symbol', 'Text', 'RichText'].includes(f.type)) ?? [];

  const runAudit = useCallback(async () => {
    if (!contentTypeId || !actionId) return;

    setIsRunning(true);
    setResults([]);
    setSelectedResult(null);

    const localesRes = await (sdk.cma as any).locale.getMany({});
    const defaultLocale: string = localesRes.items.find((l: any) => l.default)?.code ?? 'en-US';

    const entriesRes = await (sdk.cma as any).entry.getMany({
      query: { content_type: contentTypeId, limit: 25, 'sys.publishedAt[exists]': true },
    });

    const entries = entriesRes.items;
    setProgress({ done: 0, total: entries.length });

    const allResults: GradeResult[] = [];

    for (const entry of entries) {
      const firstFieldVal = Object.values(entry.fields)[0] as any;
      const title = titleField
        ? String(entry.fields[titleField]?.[defaultLocale] ?? entry.sys.id)
        : String(Object.values(firstFieldVal ?? {})[0] ?? entry.sys.id);

      const bodyVal = bodyField ? entry.fields[bodyField]?.[defaultLocale] : undefined;
      const body =
        typeof bodyVal === 'string'
          ? bodyVal
          : bodyVal?.nodeType === 'document'
          ? extractRichText(bodyVal)
          : String(bodyVal ?? '');

      try {
        const res = await (sdk.cma as any).appActionCall.createWithResponse(
          {
            appActionId: actionId,
            appDefinitionId: appId,
          },
          {
            parameters: { entryId: entry.sys.id, title, body: body.slice(0, 3000), contentType: contentTypeId },
          },
        );

        const payload = res?.response?.body ?? res?.body ?? {};
        allResults.push({
          entryId: entry.sys.id,
          title,
          score: typeof payload.score === 'number' ? payload.score : 0,
          summary: payload.summary ?? 'No summary returned.',
          suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : [],
          status: 'done',
        });
      } catch (err: any) {
        allResults.push({
          entryId: entry.sys.id,
          title,
          score: 0,
          summary: '',
          suggestions: [],
          status: 'error',
          error: err?.message ?? 'Unknown error',
        });
      }

      setProgress((p) => ({ ...p, done: p.done + 1 }));
      setResults([...allResults]);
    }

    setIsRunning(false);
  }, [sdk, contentTypeId, titleField, bodyField, actionId, appId]);

  const handleExport = () => {
    if (!results.length) return;
    const headers = ['Entry ID', 'Title', 'Score', 'Summary', 'Suggestions', 'Status'];
    const rows = results.map((r) => [r.entryId, r.title, r.score, r.summary, r.suggestions.join(' | '), r.status]);
    downloadCsv(`ai-audit-${formatDateForCsv(new Date()).replace(/[ :]/g, '-')}.csv`, headers, rows);
  };

  return (
    <Flex flexDirection="column" gap="spacingM">
      <Flex justifyContent="space-between" alignItems="flex-start">
        <Flex flexDirection="column" gap="spacingXs">
          <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">AI Content Audit</Text>
          <Text fontColor="gray600" fontSize="fontSizeS">
            Use Contentful AI Actions to score content quality, clarity, and completeness.
          </Text>
        </Flex>
        {results.length > 0 && (
          <Button variant="secondary" size="small" startIcon={<DownloadSimpleIcon />} onClick={handleExport}>
            Export CSV
          </Button>
        )}
      </Flex>

      {!actionId && <SetupGuide appId={appId} />}

      {/* Config row */}
      <Card padding="default">
        <Flex gap="spacingM" flexWrap="wrap" alignItems="flex-end">
          <FormControl style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
            <FormControl.Label>Content type</FormControl.Label>
            <Select value={contentTypeId} onChange={(e) => setContentTypeId(e.target.value)}>
              <Select.Option value="">Select…</Select.Option>
              {ctData?.map((ct) => (
                <Select.Option key={ct.sys.id} value={ct.sys.id}>{ct.name}</Select.Option>
              ))}
            </Select>
          </FormControl>

          <FormControl style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
            <FormControl.Label>Title field</FormControl.Label>
            <Select value={titleField} onChange={(e) => setTitleField(e.target.value)}>
              <Select.Option value="">Auto-detect</Select.Option>
              {textFields.map((f) => (
                <Select.Option key={f.id} value={f.id}>{f.name}</Select.Option>
              ))}
            </Select>
          </FormControl>

          <FormControl style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
            <FormControl.Label>Body field</FormControl.Label>
            <Select value={bodyField} onChange={(e) => setBodyField(e.target.value)}>
              <Select.Option value="">Auto-detect</Select.Option>
              {textFields.map((f) => (
                <Select.Option key={f.id} value={f.id}>{f.name}</Select.Option>
              ))}
            </Select>
          </FormControl>

          <Button
            variant="primary"
            startIcon={<OpenAiLogoIcon />}
            isDisabled={!contentTypeId || isRunning}
            isLoading={isRunning}
            onClick={runAudit}
          >
            {isRunning ? `Auditing… ${progress.done}/${progress.total}` : 'Run audit'}
          </Button>
        </Flex>

        {!actionId && (
          <Text fontSize="fontSizeS" fontColor="gray500" marginTop="spacingS" as="p">
            Configure an AI Action ID in Config Screen → AI Audit to enable live scoring.
            Results will show &quot;error&quot; until then.
          </Text>
        )}
      </Card>

      {/* Results */}
      {results.length > 0 && (
        <>
          {selectedResult ? (
            <Card padding="default">
              <Flex flexDirection="column" gap="spacingM">
                <Flex justifyContent="space-between" alignItems="center">
                  <Flex alignItems="center" gap="spacingS">
                    <OpenAiLogoIcon size="small" style={{ color: '#8B2EEA' }} />
                    <Text fontWeight="fontWeightDemiBold">{selectedResult.title}</Text>
                    <ScoreBadge score={selectedResult.score} />
                  </Flex>
                  <Button variant="transparent" size="small" onClick={() => setSelectedResult(null)}>
                    ← Back to list
                  </Button>
                </Flex>

                <SimpleProgress value={selectedResult.score} />

                <Flex flexDirection="column" gap="spacingXs">
                  <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeS">Summary</Text>
                  <Text fontSize="fontSizeS">{selectedResult.summary || 'No summary available.'}</Text>
                </Flex>

                {selectedResult.suggestions.length > 0 && (
                  <Flex flexDirection="column" gap="spacingXs">
                    <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeS">Suggestions</Text>
                    {selectedResult.suggestions.map((s, i) => (
                      <Flex key={i} gap="spacingXs" alignItems="flex-start">
                        <CheckCircleIcon size="tiny" style={{ color: '#1773EB', flexShrink: 0, marginTop: 2 }} />
                        <Text fontSize="fontSizeS">{s}</Text>
                      </Flex>
                    ))}
                  </Flex>
                )}

                {selectedResult.status === 'error' && (
                  <Note variant="negative">Error: {selectedResult.error}</Note>
                )}
              </Flex>
            </Card>
          ) : (
            <Table>
              <Table.Head>
                <Table.Row>
                  <Table.Cell>Entry</Table.Cell>
                  <Table.Cell>Score</Table.Cell>
                  <Table.Cell>Summary</Table.Cell>
                  <Table.Cell>Status</Table.Cell>
                </Table.Row>
              </Table.Head>
              <Table.Body>
                {results.map((r) => (
                  <Table.Row key={r.entryId} style={{ cursor: 'pointer' }} onClick={() => setSelectedResult(r)}>
                    <Table.Cell>
                      <Text style={{ color: '#1773EB', textDecoration: 'underline' }}>{r.title}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      {r.status === 'error' ? <Badge variant="negative">Error</Badge> : <ScoreBadge score={r.score} />}
                    </Table.Cell>
                    <Table.Cell>
                      <Text fontColor="gray600" fontSize="fontSizeS">
                        {r.summary ? r.summary.slice(0, 80) + (r.summary.length > 80 ? '…' : '') : r.error ?? '—'}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge variant={r.status === 'done' ? 'positive' : r.status === 'error' ? 'negative' : 'secondary'}>
                        {r.status}
                      </Badge>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </>
      )}

      {!isRunning && results.length === 0 && contentTypeId && (
        <Note variant="neutral">Select a content type and click Run audit to analyse up to 25 published entries.</Note>
      )}
    </Flex>
  );
}

/** Recursively extract plain text from a Contentful Rich Text document */
function extractRichText(node: any): string {
  if (!node) return '';
  if (typeof node.value === 'string') return node.value;
  if (Array.isArray(node.content)) return node.content.map(extractRichText).join(' ');
  return '';
}
