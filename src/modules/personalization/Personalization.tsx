/**
 * Personalization module — CMA-native Ninetailed detection.
 *
 * Works by querying for Ninetailed's standard content types:
 *   nt_experience, nt_audience, nt_variant
 *
 * No Ninetailed API key required for coverage data.
 * An optional Ninetailed Management API key (Config Screen) unlocks
 * impression/conversion analytics when added later.
 *
 * Docs: https://www.contentful.com/developers/docs/extensibility/app-framework/
 * Ninetailed: https://ninetailed.io/
 */
import { useState } from 'react';
import { useSDK } from '@contentful/react-apps-toolkit';
import { useQuery } from '@tanstack/react-query';
import {
  Flex,
  Text,
  Spinner,
  Note,
  Badge,
  Table,
  Tabs,
  Card,
  Button,
  TextLink,
} from '@contentful/f36-components';
import { DownloadSimpleIcon, WarningIcon } from '@contentful/f36-icons';
import { downloadCsv, formatDateForCsv } from '../../lib/csv';
import type { ModuleProps } from '../types';

// ─── Ninetailed content type IDs ─────────────────────────────────────────────
const NT_EXPERIENCE_CT = 'nt_experience';
const NT_AUDIENCE_CT = 'nt_audience';

// ─── Types ───────────────────────────────────────────────────────────────────

interface NtExperience {
  id: string;
  name: string;
  type: string; // 'nt_experiment' | 'nt_personalization'
  status: 'Draft' | 'Published' | 'Changed';
  audienceName: string;
  variantCount: number;
  updatedAt: string;
}

interface NtAudience {
  id: string;
  name: string;
  description: string;
  status: 'Draft' | 'Published' | 'Changed';
}

interface CoverageStat {
  contentTypeId: string;
  contentTypeName: string;
  totalEntries: number;
  personalizedEntries: number;
  pct: number;
}

interface P13nData {
  configured: boolean;
  experiences: NtExperience[];
  audiences: NtAudience[];
  coverage: CoverageStat[];
  totalPersonalized: number;
  totalEntries: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function entryStatus(entry: any): 'Draft' | 'Published' | 'Changed' {
  if (!entry.sys.publishedAt) return 'Draft';
  if (entry.sys.updatedAt > entry.sys.publishedAt) return 'Changed';
  return 'Published';
}

function statusVariant(status: string): 'positive' | 'warning' | 'secondary' {
  if (status === 'Published') return 'positive';
  if (status === 'Changed') return 'warning';
  return 'secondary';
}

function experienceTypeLabel(type: string): string {
  if (type?.includes('experiment') || type?.includes('a_b')) return 'A/B Test';
  if (type?.includes('personal')) return 'Personalization';
  return type ?? 'Unknown';
}

function experienceTypeVariant(type: string): 'primary' | 'secondary' | 'warning' {
  if (type?.includes('experiment') || type?.includes('a_b')) return 'primary';
  if (type?.includes('personal')) return 'warning';
  return 'secondary';
}

function SimpleProgress({ value }: { value: number }) {
  const color = value >= 60 ? '#00C459' : value >= 30 ? '#F0AB00' : '#8c9bab';
  return (
    <div style={{ height: 6, background: '#e5e9ed', borderRadius: 3, overflow: 'hidden', flex: 1 }}>
      <div style={{ width: `${Math.min(100, value)}%`, height: '100%', background: color, borderRadius: 3 }} />
    </div>
  );
}

// ─── Setup guide ──────────────────────────────────────────────────────────────

function SetupGuide() {
  const [open, setOpen] = useState(false);
  return (
    <Note variant="warning">
      <Flex flexDirection="column" gap="spacingS">
        <Flex gap="spacingXs" alignItems="center">
          <WarningIcon size="small" />
          <Text fontWeight="fontWeightDemiBold">Ninetailed not detected in this space</Text>
        </Flex>
        <Text fontSize="fontSizeS">
          This module reads Ninetailed&apos;s standard content types (<code>nt_experience</code>,{' '}
          <code>nt_audience</code>). They were not found in the current space.
        </Text>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1773EB', fontSize: 13, padding: 0, textAlign: 'left' }}
        >
          {open ? '▲ Hide setup steps' : '▼ How to enable personalization'}
        </button>
        {open && (
          <Flex flexDirection="column" gap="spacingS" style={{ borderLeft: '3px solid #F0AB00', paddingLeft: 12 }}>
            <Text fontSize="fontSizeS" fontWeight="fontWeightDemiBold">1. Install Ninetailed in Contentful</Text>
            <Text fontSize="fontSizeS">
              Go to <strong>Apps → Marketplace</strong> and install the Ninetailed app. It will create
              the required content types (<code>nt_experience</code>, <code>nt_audience</code>, <code>nt_variant</code>)
              in this space.
            </Text>
            <Text fontSize="fontSizeS" fontWeight="fontWeightDemiBold">2. Enable personalization on content types</Text>
            <Text fontSize="fontSizeS">
              In the Ninetailed app settings, enable personalization for the content types you want
              to A/B test or personalize. This adds an <code>nt_experiences</code> field to those types.
            </Text>
            <Text fontSize="fontSizeS" fontWeight="fontWeightDemiBold">3. Create your first experience</Text>
            <Text fontSize="fontSizeS">
              Create an <code>nt_experience</code> entry, link it to an audience, add variants, and
              publish. This module will then show coverage and experiment status automatically.
            </Text>
            <Text fontSize="fontSizeS">
              <a href="https://docs.ninetailed.io/" target="_blank" rel="noopener noreferrer" style={{ color: '#1773EB' }}>
                Ninetailed docs →
              </a>{' '}
              ·{' '}
              <a href="https://www.contentful.com/marketplace/ninetailed/" target="_blank" rel="noopener noreferrer" style={{ color: '#1773EB' }}>
                Contentful Marketplace →
              </a>
            </Text>
          </Flex>
        )}
      </Flex>
    </Note>
  );
}

// ─── Data fetcher ─────────────────────────────────────────────────────────────

async function fetchP13nData(sdk: ReturnType<typeof useSDK>): Promise<P13nData> {
  // Check if nt_experience content type exists
  let contentTypes: any[];
  try {
    const ctRes = await (sdk.cma as any).contentType.getMany({ query: { limit: 200 } });
    contentTypes = (ctRes.items as Array<{ sys: { id: string }; name: string; fields: any[] }>)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return { configured: false, experiences: [], audiences: [], coverage: [], totalPersonalized: 0, totalEntries: 0 };
  }

  const ntExpCt = contentTypes.find((ct: any) => ct.sys.id === NT_EXPERIENCE_CT);
  const ntAudCt = contentTypes.find((ct: any) => ct.sys.id === NT_AUDIENCE_CT);

  if (!ntExpCt && !ntAudCt) {
    return { configured: false, experiences: [], audiences: [], coverage: [], totalPersonalized: 0, totalEntries: 0 };
  }

  const localesRes = await (sdk.cma as any).locale.getMany({});
  const defaultLocale: string = localesRes.items.find((l: any) => l.default)?.code ?? 'en-US';

  // Fetch audiences
  let audiences: NtAudience[] = [];
  if (ntAudCt) {
    const audRes = await (sdk.cma as any).entry.getMany({ query: { content_type: NT_AUDIENCE_CT, limit: 100 } });
    audiences = audRes.items.map((e: any) => ({
      id: e.sys.id,
      name: e.fields?.nt_name?.[defaultLocale] ?? e.fields?.name?.[defaultLocale] ?? e.sys.id,
      description: e.fields?.nt_description?.[defaultLocale] ?? '',
      status: entryStatus(e),
    }));
  }

  // Build audience name lookup
  const audienceNames: Record<string, string> = {};
  for (const a of audiences) audienceNames[a.id] = a.name;

  // Fetch experiences
  let experiences: NtExperience[] = [];
  if (ntExpCt) {
    const expRes = await (sdk.cma as any).entry.getMany({ query: { content_type: NT_EXPERIENCE_CT, limit: 100 } });
    experiences = expRes.items.map((e: any) => {
      const audienceRef = e.fields?.nt_audience?.[defaultLocale];
      const audienceId = audienceRef?.sys?.id ?? audienceRef?.id;
      const variants = e.fields?.nt_variants?.[defaultLocale] ?? [];
      return {
        id: e.sys.id,
        name: e.fields?.nt_name?.[defaultLocale] ?? e.sys.id,
        type: e.fields?.nt_type?.[defaultLocale] ?? '',
        status: entryStatus(e),
        audienceName: audienceId ? (audienceNames[audienceId] ?? audienceId) : 'All visitors',
        variantCount: Array.isArray(variants) ? variants.length : 0,
        updatedAt: e.sys.updatedAt,
      };
    });
  }

  // Coverage: find CTs with nt_experiences field and count personalized entries
  const personalizedCts = contentTypes.filter((ct: any) =>
    ct.fields?.some((f: any) => f.id === 'nt_experiences') &&
    ct.sys.id !== NT_EXPERIENCE_CT &&
    ct.sys.id !== NT_AUDIENCE_CT
  );

  const coverage: CoverageStat[] = [];
  let totalPersonalized = 0;
  let totalEntries = 0;

  for (const ct of personalizedCts.slice(0, 15)) {
    const allRes = await (sdk.cma as any).entry.getMany({ query: { content_type: ct.sys.id, limit: 1 } });
    const total = allRes.total;
    if (total === 0) continue;

    // Count entries that have nt_experiences populated
    const personalizedRes = await (sdk.cma as any).entry.getMany({
      query: { content_type: ct.sys.id, 'fields.nt_experiences[exists]': true, limit: 1 },
    });
    const personalized = personalizedRes.total;

    coverage.push({
      contentTypeId: ct.sys.id,
      contentTypeName: ct.name,
      totalEntries: total,
      personalizedEntries: personalized,
      pct: Math.round((personalized / total) * 100),
    });

    totalPersonalized += personalized;
    totalEntries += total;
  }

  coverage.sort((a, b) => b.pct - a.pct);

  return { configured: true, experiences, audiences, coverage, totalPersonalized, totalEntries };
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Personalization({ installationParams }: ModuleProps) {
  const sdk = useSDK();
  const ninetailedApiKey = (installationParams as any).ninetailedApiKey ?? '';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['personalization'],
    queryFn: () => fetchP13nData(sdk),
    staleTime: 5 * 60 * 1000,
  });

  const handleExportExperiences = () => {
    if (!data?.experiences.length) return;
    const headers = ['ID', 'Name', 'Type', 'Audience', 'Variants', 'Status', 'Updated'];
    const rows = data.experiences.map((e) => [
      e.id, e.name, experienceTypeLabel(e.type), e.audienceName, e.variantCount, e.status, formatDateForCsv(e.updatedAt),
    ]);
    downloadCsv(`p13n-experiences-${formatDateForCsv(new Date()).replace(/[ :]/g, '-')}.csv`, headers, rows);
  };

  return (
    <Flex flexDirection="column" gap="spacingM">
      <Flex justifyContent="space-between" alignItems="flex-start">
        <Flex flexDirection="column" gap="spacingXs">
          <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">Personalization</Text>
          <Text fontColor="gray600" fontSize="fontSizeS">
            Ninetailed experience coverage, active experiments, and audience targeting across your space.
          </Text>
        </Flex>
        <Button variant="secondary" size="small" onClick={() => refetch()}>
          Refresh
        </Button>
      </Flex>

      {isLoading && (
        <Flex gap="spacingS" alignItems="center" paddingTop="spacingL">
          <Spinner />
          <Text fontColor="gray500" fontSize="fontSizeS">Reading Ninetailed content types…</Text>
        </Flex>
      )}

      {error && <Note variant="negative">Failed to load personalization data.</Note>}

      {data && !isLoading && !data.configured && <SetupGuide />}

      {data?.configured && (
        <>
          {/* Summary strip */}
          <Card padding="default">
            <Flex gap="spacingXl" flexWrap="wrap" alignItems="flex-start">
              <Flex flexDirection="column" gap="spacingXs">
                <Text fontColor="gray500" fontSize="fontSizeS">Experiences</Text>
                <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeXl">{data.experiences.length}</Text>
              </Flex>
              <Flex flexDirection="column" gap="spacingXs">
                <Text fontColor="gray500" fontSize="fontSizeS">Audiences</Text>
                <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeXl">{data.audiences.length}</Text>
              </Flex>
              <Flex flexDirection="column" gap="spacingXs">
                <Text fontColor="gray500" fontSize="fontSizeS">Personalized content types</Text>
                <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeXl">{data.coverage.length}</Text>
              </Flex>
              {data.totalEntries > 0 && (
                <Flex flexDirection="column" gap="spacingXs">
                  <Text fontColor="gray500" fontSize="fontSizeS">Overall coverage</Text>
                  <Badge variant={data.totalPersonalized / data.totalEntries >= 0.3 ? 'positive' : 'warning'}>
                    {Math.round((data.totalPersonalized / data.totalEntries) * 100)}%
                  </Badge>
                </Flex>
              )}
              {!ninetailedApiKey && (
                <Flex flexDirection="column" gap="spacingXs" style={{ borderLeft: '1px solid #e5e9ed', paddingLeft: 24 }}>
                  <Text fontColor="gray500" fontSize="fontSizeS">Analytics (impressions/CVR)</Text>
                  <Badge variant="secondary">Add API key in Config</Badge>
                </Flex>
              )}
            </Flex>
          </Card>

          <Tabs defaultTab="experiences">
            <Tabs.List>
              <Tabs.Tab panelId="experiences">Experiences ({data.experiences.length})</Tabs.Tab>
              <Tabs.Tab panelId="audiences">Audiences ({data.audiences.length})</Tabs.Tab>
              <Tabs.Tab panelId="coverage">Content coverage ({data.coverage.length} types)</Tabs.Tab>
            </Tabs.List>

            {/* Experiences */}
            <Tabs.Panel id="experiences">
              {data.experiences.length === 0 ? (
                <Note variant="neutral">
                  No <code>nt_experience</code> entries found. Create your first experience in the Ninetailed app.
                </Note>
              ) : (
                <>
                  <Flex justifyContent="flex-end" marginBottom="spacingS">
                    <Button variant="secondary" size="small" startIcon={<DownloadSimpleIcon />} onClick={handleExportExperiences}>
                      Export CSV
                    </Button>
                  </Flex>
                  <Table>
                    <Table.Head>
                      <Table.Row>
                        <Table.Cell>Experience</Table.Cell>
                        <Table.Cell>Type</Table.Cell>
                        <Table.Cell>Audience</Table.Cell>
                        <Table.Cell>Variants</Table.Cell>
                        <Table.Cell>Status</Table.Cell>
                        <Table.Cell>Updated</Table.Cell>
                      </Table.Row>
                    </Table.Head>
                    <Table.Body>
                      {data.experiences.map((exp) => (
                        <Table.Row key={exp.id}>
                          <Table.Cell>
                            <TextLink
                              as="button"
                              onClick={() => (sdk as any).navigator?.openEntry(exp.id, { slideIn: true })}
                            >
                              {exp.name}
                            </TextLink>
                          </Table.Cell>
                          <Table.Cell>
                            <Badge variant={experienceTypeVariant(exp.type)} style={{ textTransform: 'none' }}>
                              {experienceTypeLabel(exp.type)}
                            </Badge>
                          </Table.Cell>
                          <Table.Cell>
                            <Text fontColor="gray600" fontSize="fontSizeS">{exp.audienceName}</Text>
                          </Table.Cell>
                          <Table.Cell>
                            <Badge variant="secondary">{exp.variantCount}</Badge>
                          </Table.Cell>
                          <Table.Cell>
                            <Badge variant={statusVariant(exp.status)}>{exp.status}</Badge>
                          </Table.Cell>
                          <Table.Cell>
                            <Text fontColor="gray500" fontSize="fontSizeS">
                              {new Date(exp.updatedAt).toLocaleDateString()}
                            </Text>
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table>
                </>
              )}
            </Tabs.Panel>

            {/* Audiences */}
            <Tabs.Panel id="audiences">
              {data.audiences.length === 0 ? (
                <Note variant="neutral">No <code>nt_audience</code> entries found.</Note>
              ) : (
                <Table>
                  <Table.Head>
                    <Table.Row>
                      <Table.Cell>Audience</Table.Cell>
                      <Table.Cell>Description</Table.Cell>
                      <Table.Cell>Status</Table.Cell>
                    </Table.Row>
                  </Table.Head>
                  <Table.Body>
                    {data.audiences.map((aud) => (
                      <Table.Row key={aud.id}>
                        <Table.Cell>
                          <TextLink
                            as="button"
                            onClick={() => (sdk as any).navigator?.openEntry(aud.id, { slideIn: true })}
                          >
                            {aud.name}
                          </TextLink>
                        </Table.Cell>
                        <Table.Cell>
                          <Text fontColor="gray600" fontSize="fontSizeS">
                            {aud.description || '—'}
                          </Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Badge variant={statusVariant(aud.status)}>{aud.status}</Badge>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              )}
            </Tabs.Panel>

            {/* Content coverage */}
            <Tabs.Panel id="coverage">
              {data.coverage.length === 0 ? (
                <Note variant="neutral">
                  No content types have the <code>nt_experiences</code> field enabled yet.
                  Use the Ninetailed app to enable personalization on a content type.
                </Note>
              ) : (
                <>
                  <Text fontColor="gray500" fontSize="fontSizeS" marginBottom="spacingM" as="p">
                    Coverage = entries with at least one Ninetailed experience attached.
                  </Text>
                  <Table>
                    <Table.Head>
                      <Table.Row>
                        <Table.Cell>Content type</Table.Cell>
                        <Table.Cell>Personalized</Table.Cell>
                        <Table.Cell>Total</Table.Cell>
                        <Table.Cell style={{ minWidth: 160 }}>Coverage</Table.Cell>
                      </Table.Row>
                    </Table.Head>
                    <Table.Body>
                      {data.coverage.map((row) => (
                        <Table.Row key={row.contentTypeId}>
                          <Table.Cell>
                            <Text fontWeight="fontWeightDemiBold">{row.contentTypeName}</Text>
                            <Text fontColor="gray500" fontSize="fontSizeS"> ({row.contentTypeId})</Text>
                          </Table.Cell>
                          <Table.Cell>
                            <Badge variant={row.personalizedEntries > 0 ? 'positive' : 'secondary'}>
                              {row.personalizedEntries}
                            </Badge>
                          </Table.Cell>
                          <Table.Cell>{row.totalEntries}</Table.Cell>
                          <Table.Cell>
                            <Flex alignItems="center" gap="spacingXs">
                              <SimpleProgress value={row.pct} />
                              <Text fontSize="fontSizeS" style={{ width: 36, textAlign: 'right' }}>{row.pct}%</Text>
                            </Flex>
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table>
                </>
              )}
            </Tabs.Panel>
          </Tabs>
        </>
      )}
    </Flex>
  );
}
