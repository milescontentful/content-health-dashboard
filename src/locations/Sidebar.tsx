/**
 * Entry Sidebar — live per-entry health score.
 *
 * Recomputes as the editor types (field onValueChanged), so filling in an SEO
 * description visibly moves the score. Pure scorers are reused from the
 * dashboard modules; nothing here re-implements scoring.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSDK } from '@contentful/react-apps-toolkit';
import type { SidebarAppSDK } from '@contentful/app-sdk';
import { useQuery } from '@tanstack/react-query';
import { Flex, Text, Button, Note, Badge, Spinner, TextLink } from '@contentful/f36-components';
import tokens from '@contentful/f36-tokens';
import { ScoreRing, statusColor } from '../components/ScoreRing';
import { scoreSEO, scoreAEO, scoreGEO } from '../modules/seo-aeo-geo/scorer';
import { checkCompleteness } from '../lib/completeness';
import { extractRichText } from '../lib/richText';
import { gradeFor } from '../lib/healthScore';
import { invokeAppActionAndWait } from '../lib/aiActions';
import { APP_ACTION_IDS } from '../lib/appActions';
import type { AppInstallationParameters } from '../modules/types';

type Fields = Record<string, Record<string, unknown>>;

interface AiGrade {
  score: number;
  summary: string;
  suggestions: string[];
}

function ScorePill({ label, score }: { label: string; score: number }) {
  const color = statusColor(score);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '92px 1fr 28px', gap: 8, alignItems: 'center' }}>
      <Text fontSize="fontSizeS" fontColor="gray600">{label}</Text>
      <div style={{ height: 6, background: tokens.gray200, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.6s cubic-bezier(0.22, 1, 0.36, 1)' }} />
      </div>
      <Text fontSize="fontSizeS" fontWeight="fontWeightDemiBold" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {score}
      </Text>
    </div>
  );
}

const Sidebar = () => {
  const sdk = useSDK<SidebarAppSDK>();
  const params = (sdk.parameters?.installation ?? {}) as AppInstallationParameters;

  useEffect(() => {
    sdk.window.startAutoResizer();
    return () => sdk.window.stopAutoResizer();
  }, [sdk]);

  const defaultLocale = sdk.locales.default;
  const contentTypeId = sdk.contentType.sys.id;

  // Snapshot of field values in scorer shape: fields[fieldId][locale] = value.
  // Rebuilt (debounced) on every field change — this is the "live" part.
  const readFields = useCallback((): Fields => {
    const out: Fields = {};
    for (const fieldId of Object.keys(sdk.entry.fields)) {
      out[fieldId] = { [defaultLocale]: sdk.entry.fields[fieldId].getValue() };
    }
    return out;
  }, [sdk, defaultLocale]);

  const [fields, setFields] = useState<Fields>(readFields);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const detachers = Object.keys(sdk.entry.fields).map((fieldId) =>
      sdk.entry.fields[fieldId].onValueChanged(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => setFields(readFields()), 300);
      }),
    );
    return () => {
      detachers.forEach((d) => d());
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [sdk, readFields]);

  // SEO scorers only make sense for page-like types: respect the configured
  // list; if none configured, score every type.
  const seoApplies =
    !params.seoPageContentTypes?.length || params.seoPageContentTypes.includes(contentTypeId);

  const fieldNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const f of sdk.contentType.fields) {
      names[f.name.toLowerCase().replace(/\s+/g, '')] = f.id;
      names[f.id.toLowerCase()] = f.id;
    }
    return names;
  }, [sdk.contentType]);

  const seo = seoApplies ? scoreSEO(fields, defaultLocale, fieldNames) : null;
  const aeo = seoApplies ? scoreAEO(fields, defaultLocale, fieldNames) : null;
  const geo = seoApplies ? scoreGEO(fields, defaultLocale, fieldNames) : null;

  const completenessIssues = checkCompleteness({ fields }, sdk.contentType as any, defaultLocale);
  const completeness = Math.round(
    100 * (1 - completenessIssues.length / Math.max(1, sdk.contentType.fields.length)),
  );

  // Alt-text coverage of assets linked from this entry (native sources only —
  // the full dashboard handles wrapper-type sources)
  const linkedAssetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const fieldVal of Object.values(fields)) {
      const v: any = fieldVal?.[defaultLocale];
      const links = Array.isArray(v) ? v : [v];
      for (const link of links) {
        if (link?.sys?.linkType === 'Asset' && link.sys.id) ids.add(link.sys.id);
      }
    }
    return [...ids].sort();
  }, [fields, defaultLocale]);

  const { data: altStats } = useQuery({
    queryKey: ['sidebar-alt', linkedAssetIds],
    enabled: linkedAssetIds.length > 0,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await (sdk.cma as any).asset.getMany({
        query: { 'sys.id[in]': linkedAssetIds.join(','), limit: 100 },
      });
      const nativeFields = (params.altTextSources ?? [{ contentType: '__asset__', field: 'description' }])
        .filter((s) => s.contentType === '__asset__')
        .map((s) => s.field);
      const withAlt = res.items.filter((a: any) =>
        nativeFields.some((f) => !!a.fields?.[f]?.[defaultLocale]),
      ).length;
      return { total: res.items.length, withAlt };
    },
  });
  const altScore = altStats && altStats.total > 0
    ? Math.round(100 * (altStats.withAlt / altStats.total))
    : null;

  // Composite: average of whatever applies to this entry
  const parts = [
    completeness,
    ...(seo && aeo && geo ? [Math.round((seo.score + aeo.score + geo.score) / 3)] : []),
    ...(altScore !== null ? [altScore] : []),
  ];
  const overall = Math.round(parts.reduce((s, v) => s + v, 0) / parts.length);
  const grade = gradeFor(overall) ?? 'F';

  // AI grade (via the gradeContent App Function)
  const [aiGrade, setAiGrade] = useState<AiGrade | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const aiConfigured = !!params.aiActionId;

  const runAiGrade = useCallback(async () => {
    setAiLoading(true);
    setAiError('');
    try {
      const firstText = Object.entries(fields).find(([, v]) => typeof v?.[defaultLocale] === 'string');
      const rich = Object.values(fields).find((v: any) => v?.[defaultLocale]?.nodeType === 'document');
      const body = rich ? extractRichText((rich as any)[defaultLocale]) : String(firstText?.[1]?.[defaultLocale] ?? '');
      const title = String(firstText?.[1]?.[defaultLocale] ?? sdk.entry.getSys().id);

      const payload = await invokeAppActionAndWait<AiGrade>(
        sdk.cma,
        sdk.ids.app ?? '',
        APP_ACTION_IDS.gradeContent,
        {
          entryId: sdk.entry.getSys().id,
          title,
          body: body.slice(0, 3000),
          contentType: contentTypeId,
          brandVoice: params.brandVoice || undefined,
          aiActionId: params.aiActionId || undefined,
        },
      );
      setAiGrade({
        score: typeof payload.score === 'number' ? payload.score : 0,
        summary: payload.summary ?? '',
        suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : [],
      });
    } catch (err: any) {
      setAiError(err?.message ?? 'Grading failed.');
    } finally {
      setAiLoading(false);
    }
  }, [sdk, fields, defaultLocale, contentTypeId, params.brandVoice, params.aiActionId]);

  return (
    <Flex flexDirection="column" gap="spacingS">
      <Flex justifyContent="center">
        <ScoreRing score={overall} grade={grade ?? 'F'} size={96} />
      </Flex>

      <Flex flexDirection="column" gap="spacingXs">
        <ScorePill label="Completeness" score={completeness} />
        {seo && <ScorePill label="SEO" score={seo.score} />}
        {aeo && <ScorePill label="AEO" score={aeo.score} />}
        {geo && <ScorePill label="GEO" score={geo.score} />}
        {altScore !== null && <ScorePill label="Alt text" score={altScore} />}
      </Flex>

      {completenessIssues.length > 0 && (
        <Text fontSize="fontSizeS" fontColor="gray600">
          {completenessIssues.length} field issue{completenessIssues.length !== 1 ? 's' : ''}:{' '}
          {completenessIssues.slice(0, 3).map((i) => i.field).join(', ')}
          {completenessIssues.length > 3 ? '…' : ''}
        </Text>
      )}
      {seo && seo.issues.length > 0 && (
        <Text fontSize="fontSizeS" fontColor="gray600">
          Top SEO fix: {seo.issues[0]}
        </Text>
      )}

      {aiConfigured && (
        <Button variant="secondary" size="small" isFullWidth isLoading={aiLoading} onClick={runAiGrade}>
          {aiGrade ? 'Re-grade with AI ✦' : 'Grade with AI ✦'}
        </Button>
      )}
      {aiLoading && (
        <Flex gap="spacingXs" alignItems="center" justifyContent="center">
          <Spinner size="small" />
          <Text fontSize="fontSizeS" fontColor="gray500">Grading…</Text>
        </Flex>
      )}
      {aiError && <Note variant="negative">{aiError}</Note>}
      {aiGrade && !aiLoading && (
        <div style={{ border: `1px solid ${tokens.gray200}`, borderRadius: 8, padding: 10 }}>
          <Flex justifyContent="space-between" alignItems="center" marginBottom="spacing2Xs">
            <Text fontSize="fontSizeS" fontWeight="fontWeightDemiBold">AI quality score</Text>
            <Badge variant={aiGrade.score >= 75 ? 'positive' : aiGrade.score >= 50 ? 'warning' : 'negative'}>
              {aiGrade.score}
            </Badge>
          </Flex>
          {aiGrade.summary && <Text fontSize="fontSizeS" fontColor="gray600">{aiGrade.summary}</Text>}
          {aiGrade.suggestions.slice(0, 3).map((s, i) => (
            <Text key={i} fontSize="fontSizeS" fontColor="gray600" as="p" style={{ margin: '4px 0 0' }}>• {s}</Text>
          ))}
        </div>
      )}

      <TextLink as="button" onClick={() => sdk.navigator.openCurrentAppPage()}>
        Open Content Health dashboard →
      </TextLink>
    </Flex>
  );
};

export default Sidebar;
