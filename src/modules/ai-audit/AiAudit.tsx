/**
 * AI Content Audit module — calls the grade-content App Function via an App Action.
 *
 * Setup (one-time):
 *  1. Run `npm run build:all && npm run upload` to bundle functions into the app.
 *  2. In the app definition Actions tab, add an action with ID "grade-content",
 *     type "Function invocation", linked to the gradeContent function.
 *  3. Set a private installation parameter `openAiApiKey` via the CMA or CLI.
 *  4. Enter the action ID in Config Screen → App Functions → Content Audit.
 *
 * Docs:
 *   https://www.contentful.com/developers/docs/extensibility/app-framework/functions/#use-case-app-actions
 *   https://www.contentful.com/developers/docs/extensibility/app-framework/working-with-functions/
 */
import { useState, useCallback, useRef, useEffect } from 'react';
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
import { invokeAppActionAndWait } from '../../lib/aiActions';
import { APP_ACTION_IDS } from '../../lib/appActions';
import type { ModuleProps } from '../types';
import { extractRichText } from '../../lib/richText';
import { entryTitle } from '../../lib/entryTitle';
import { checkCompleteness, type CompletenessIssue } from '../../lib/completeness';

interface GradeResult {
  entryId: string;
  title: string;
  score: number;
  summary: string;
  suggestions: string[];
  toneScore?: number;
  toneFeedback?: string;
  completenessIssues: CompletenessIssue[];
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
        <Text fontWeight="fontWeightDemiBold">App Function not configured</Text>
        <Text fontSize="fontSizeS">
          This module calls the <code>gradeContent</code> App Function via an App Action.
          No external hosting required — functions run on Contentful&apos;s infrastructure.
        </Text>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1773EB', fontSize: 13, padding: 0, textAlign: 'left' }}
        >
          {open ? '▲ Hide setup steps' : '▼ Show setup steps'}
        </button>
        {open && (
          <Stack flexDirection="column" spacing="spacingXs" style={{ borderLeft: '3px solid #F0AB00', paddingLeft: 12 }}>
            <Text fontSize="fontSizeS" fontWeight="fontWeightDemiBold">1. Build &amp; upload</Text>
            <Text fontSize="fontSizeS">
              Run <code>npm run build:all &amp;&amp; npm run upload</code> — this bundles all four App Functions and uploads them to Contentful.
            </Text>
            <Text fontSize="fontSizeS" fontWeight="fontWeightDemiBold">2. Create App Action</Text>
            <Text fontSize="fontSizeS">
              In your App Definition Actions tab, add an action with ID <code>grade-content</code>,
              type <strong>Function invocation</strong>, linked to the <code>gradeContent</code> function.
            </Text>
            <Text fontSize="fontSizeS" fontWeight="fontWeightDemiBold">3. Set OpenAI API key (or use an AI Action)</Text>
            <Text fontSize="fontSizeS">
              Enter it in <strong>Config Screen → App Functions → OpenAI API key</strong>, or set a private
              installation parameter <code>openAiApiKey</code> via the CMA.
              App Definition ID: <code style={{ background: '#f1f3f4', padding: '1px 4px' }}>{appId || '<your-app-def-id>'}</code>
            </Text>
            <Text fontSize="fontSizeS" fontWeight="fontWeightDemiBold">4. Enter the action ID</Text>
            <Text fontSize="fontSizeS">
              Go to <strong>Config Screen → App Functions → Content Audit</strong> and enter <code>grade-content</code>.
            </Text>
            <Text fontSize="fontSizeS">
              <a href="https://www.contentful.com/developers/docs/extensibility/app-framework/working-with-functions/" target="_blank" rel="noopener noreferrer" style={{ color: '#1773EB' }}>
                Working with Functions docs →
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
  const cancelRef = useRef(false);
  const [results, setResults] = useState<GradeResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<GradeResult | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const actionId: string = installationParams.aiActionId ?? '';
  const brandVoice: string = installationParams.brandVoice ?? '';
  const appId: string = (sdk as any).ids?.app ?? '';
  const spaceId: string = (sdk as any).ids?.space ?? '';
  const environmentId: string = (sdk as any).ids?.environment ?? 'master';

  const { data: ctData } = useQuery({
    queryKey: ['ai-audit-content-types'],
    queryFn: async () => {
      const res = await (sdk.cma as any).contentType.getMany({ query: { limit: 200 } });
      return (res.items as Array<{ sys: { id: string }; name: string; fields: Array<{ id: string; name: string; type: string }> }>)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  // Land ready: pre-select the first content type (audit still runs on demand)
  useEffect(() => {
    if (!contentTypeId && ctData?.length) setContentTypeId(ctData[0].sys.id);
  }, [ctData, contentTypeId]);

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

    const gradeEntry = async (entry: any): Promise<GradeResult> => {
      const title = titleField
        ? String(entry.fields[titleField]?.[defaultLocale] ?? entry.sys.id)
        : entryTitle(entry, defaultLocale);

      const bodyVal = bodyField ? entry.fields[bodyField]?.[defaultLocale] : undefined;
      const body =
        typeof bodyVal === 'string'
          ? bodyVal
          : bodyVal?.nodeType === 'document'
          ? extractRichText(bodyVal)
          : String(bodyVal ?? '');

      const completenessIssues = selectedCt
        ? checkCompleteness(entry, selectedCt, defaultLocale)
        : [];

      try {
        const payload: { score: number; summary: string; suggestions: string[]; toneScore?: number; toneFeedback?: string } =
          await invokeAppActionAndWait(sdk.cma, appId, APP_ACTION_IDS.gradeContent, {
            entryId: entry.sys.id,
            title,
            body: body.slice(0, 3000),
            contentType: contentTypeId,
            brandVoice: brandVoice || undefined,
            aiActionId: actionId || undefined,
          });

        return {
          entryId: entry.sys.id,
          title,
          score: typeof payload.score === 'number' ? payload.score : 0,
          summary: payload.summary ?? 'No summary returned.',
          suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : [],
          toneScore: payload.toneScore,
          toneFeedback: payload.toneFeedback,
          completenessIssues,
          status: 'done',
        };
      } catch (err: any) {
        return {
          entryId: entry.sys.id,
          title,
          score: 0,
          summary: '',
          suggestions: [],
          completenessIssues,
          status: 'error',
          error: err?.message ?? 'Unknown error',
        };
      }
    };

    // Promise pool: CONCURRENCY entries grade at once; Cancel stops picking up
    // new entries (in-flight ones finish and still report).
    cancelRef.current = false;
    const CONCURRENCY = 4;
    let nextIndex = 0;
    const worker = async () => {
      while (!cancelRef.current && nextIndex < entries.length) {
        const entry = entries[nextIndex++];
        const result = await gradeEntry(entry);
        setProgress((p) => ({ ...p, done: p.done + 1 }));
        setResults((prev) => [...prev, result]);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    setIsRunning(false);
  }, [sdk, contentTypeId, titleField, bodyField, actionId, appId, brandVoice, selectedCt]);

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
          {isRunning && (
            <Button variant="secondary" onClick={() => { cancelRef.current = true; }}>
              Cancel
            </Button>
          )}
        </Flex>

        {!actionId && (
          <Text fontSize="fontSizeS" fontColor="gray500" marginTop="spacingS" as="p">
            Configure an App Action ID in Config Screen → App Functions → Content Audit to enable live scoring.
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

                {selectedResult.toneScore !== undefined && brandVoice && (
                  <Flex flexDirection="column" gap="spacingXs">
                    <Flex alignItems="center" gap="spacingXs">
                      <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeS">Brand voice alignment</Text>
                      <ScoreBadge score={selectedResult.toneScore} />
                    </Flex>
                    {selectedResult.toneFeedback && (
                      <Text fontSize="fontSizeS" fontColor="gray700">{selectedResult.toneFeedback}</Text>
                    )}
                  </Flex>
                )}

                {selectedResult.completenessIssues.length > 0 && (
                  <Flex flexDirection="column" gap="spacingXs">
                    <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeS">
                      Completeness — {selectedResult.completenessIssues.filter((i) => i.issue.startsWith('Required')).length} required field{selectedResult.completenessIssues.filter((i) => i.issue.startsWith('Required')).length !== 1 ? 's' : ''} empty
                    </Text>
                    {selectedResult.completenessIssues.map((issue, i) => (
                      <Flex key={i} gap="spacingXs" alignItems="flex-start">
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: issue.issue.startsWith('Required') ? '#E44F20' : '#F0AB00', flexShrink: 0, marginTop: 5 }} />
                        <Text fontSize="fontSizeS" fontColor="gray700">
                          <strong>{issue.field}</strong> — {issue.issue}
                        </Text>
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
                      <Table.Cell>Completeness</Table.Cell>
                      <Table.Cell>Summary</Table.Cell>
                      <Table.Cell>Status</Table.Cell>
                    </Table.Row>
                  </Table.Head>
                  <Table.Body>
                    {results.map((r) => {
                      const requiredEmpty = r.completenessIssues.filter((i) => i.issue.startsWith('Required')).length;
                      const optionalEmpty = r.completenessIssues.filter((i) => !i.issue.startsWith('Required')).length;
                      return (
                      <Table.Row key={r.entryId} style={{ cursor: 'pointer' }} onClick={() => setSelectedResult(r)}>
                        <Table.Cell>
                          <Text style={{ color: '#1773EB', textDecoration: 'underline' }}>{r.title}</Text>
                        </Table.Cell>
                        <Table.Cell>
                          {r.status === 'error' ? <Badge variant="negative">Error</Badge> : <ScoreBadge score={r.score} />}
                        </Table.Cell>
                        <Table.Cell>
                          {r.completenessIssues.length === 0 ? (
                            <Badge variant="positive">Complete</Badge>
                          ) : (
                            <Flex gap="spacingXs" flexWrap="wrap">
                              {requiredEmpty > 0 && <Badge variant="negative">{requiredEmpty} required</Badge>}
                              {optionalEmpty > 0 && <Badge variant="warning">{optionalEmpty} optional</Badge>}
                            </Flex>
                          )}
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
                      );
                    })}
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
