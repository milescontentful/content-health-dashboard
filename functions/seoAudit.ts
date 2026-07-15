/**
 * App Function: seoAudit
 *
 * Linked App Action ID: seo-audit
 *
 * Accepts:
 *   {
 *     entryId: string,
 *     title: string,
 *     body: string,
 *     slug?: string,
 *     contentType: string,
 *     heuristicSeoScore: number,   // pre-computed by frontend scorer.ts
 *     heuristicAeoScore: number,
 *     heuristicGeoScore: number,
 *     heuristicIssues: string[]
 *   }
 *
 * Returns:
 *   {
 *     seoScore: number,
 *     aeoScore: number,
 *     geoScore: number,
 *     composite: number,
 *     summary: string,
 *     suggestions: string[]
 *   }
 *
 * The LLM enriches the heuristic scores with semantic analysis and returns
 * calibrated scores alongside prioritised, concrete recommendations.
 *
 * The OpenAI API key is read from the app's private installation parameters
 * (context.appInstallation.parameters.private.openAiApiKey).
 */
import {
  FunctionEventHandler,
  FunctionTypeEnum,
  FunctionEventContext,
} from '@contentful/node-apps-toolkit';
import { getOpenAiApiKey } from './_params';

interface SeoAuditParams {
  entryId: string;
  title: string;
  body: string;
  slug?: string;
  contentType: string;
  heuristicSeoScore: number;
  heuristicAeoScore: number;
  heuristicGeoScore: number;
  heuristicIssues: string[];
}

interface SeoAuditResponse {
  seoScore: number;
  aeoScore: number;
  geoScore: number;
  composite: number;
  summary: string;
  suggestions: string[];
  metaTitleSuggestion?: string;
  metaDescriptionSuggestion?: string;
}

const SYSTEM_PROMPT = `You are a content strategist specialising in SEO (Search Engine Optimisation), AEO (Answer Engine Optimisation for featured snippets and voice search), and GEO (Generative Engine Optimisation — getting cited by AI systems like ChatGPT, Perplexity, and Claude).

You will receive:
1. A piece of content with its title, body text, slug, and content type
2. Pre-computed heuristic scores (0–100) for SEO, AEO, and GEO
3. A list of heuristic issues already detected

Your task: Return ONLY a JSON object (no markdown fences) with these fields:
- seoScore: integer 0–100 (calibrate / confirm the heuristic SEO score using semantic analysis)
- aeoScore: integer 0–100 (calibrate / confirm the heuristic AEO score)
- geoScore: integer 0–100 (calibrate / confirm the heuristic GEO score)
- composite: integer 0–100 (weighted average: SEO 40%, AEO 30%, GEO 30%)
- summary: 2–3 sentence overall assessment
- suggestions: array of 4–6 specific, actionable improvements sorted by impact
- metaTitleSuggestion: a rewritten meta/page title (50–60 chars) optimised for click-through and AI citations, or empty string if the existing title is already strong
- metaDescriptionSuggestion: a rewritten meta description (140–155 chars) optimised for featured snippets and AI answer boxes, or empty string if the existing one is already strong

Scoring bands: 75–100 = strong, 50–74 = needs improvement, 0–49 = poor`;

export const handler: FunctionEventHandler<FunctionTypeEnum.AppActionCall> = async (
  event,
  context: FunctionEventContext,
) => {
  try {
  const params = event.body as unknown as SeoAuditParams;
  const {
    title = '',
    body = '',
    slug = '',
    contentType = '',
    heuristicSeoScore = 0,
    heuristicAeoScore = 0,
    heuristicGeoScore = 0,
    heuristicIssues = [],
  } = params;

  const apiKey = getOpenAiApiKey(context);

  if (!apiKey) {
    const composite = Math.round((heuristicSeoScore * 0.4 + heuristicAeoScore * 0.3 + heuristicGeoScore * 0.3));
    return {
      seoScore: heuristicSeoScore,
      aeoScore: heuristicAeoScore,
      geoScore: heuristicGeoScore,
      composite,
      summary: 'LLM analysis not available — OpenAI API key not configured. Heuristic scores are shown. Add your key in Config Screen → App Functions.',
      suggestions: heuristicIssues.slice(0, 5).map((i) => `Fix: ${i}`),
    } satisfies SeoAuditResponse;
  }

  const userMessage = `Content type: ${contentType}
Title: ${title}
Slug: ${slug || '(none)'}
Heuristic scores — SEO: ${heuristicSeoScore}, AEO: ${heuristicAeoScore}, GEO: ${heuristicGeoScore}
Heuristic issues detected: ${heuristicIssues.join('; ') || 'none'}

Body (first 3000 chars):
${body.slice(0, 3000)}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 600,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const json = await response.json();
  const raw = json.choices?.[0]?.message?.content ?? '{}';

  let parsed: Partial<SeoAuditResponse>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  const seoScore = typeof parsed.seoScore === 'number' ? clamp(parsed.seoScore) : heuristicSeoScore;
  const aeoScore = typeof parsed.aeoScore === 'number' ? clamp(parsed.aeoScore) : heuristicAeoScore;
  const geoScore = typeof parsed.geoScore === 'number' ? clamp(parsed.geoScore) : heuristicGeoScore;

  return {
    seoScore,
    aeoScore,
    geoScore,
    composite: typeof parsed.composite === 'number' ? clamp(parsed.composite) : Math.round(seoScore * 0.4 + aeoScore * 0.3 + geoScore * 0.3),
    summary: parsed.summary ?? 'No summary returned.',
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 6) : [],
    metaTitleSuggestion: typeof parsed.metaTitleSuggestion === 'string' ? parsed.metaTitleSuggestion : undefined,
    metaDescriptionSuggestion: typeof parsed.metaDescriptionSuggestion === 'string' ? parsed.metaDescriptionSuggestion : undefined,
  } satisfies SeoAuditResponse;
  } catch (err: any) {
    return {
      seoScore: 0, aeoScore: 0, geoScore: 0, composite: 0,
      summary: `Function error: ${err?.message ?? 'Unknown error'}`,
      suggestions: [],
    };
  }
};

function clamp(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}
