/**
 * App Function: gradeContent
 *
 * Linked App Action ID: grade-content
 *
 * Accepts:
 *   { entryId: string, title: string, body: string, contentType: string }
 *
 * Returns:
 *   { score: number (0–100), summary: string, suggestions: string[] }
 *
 * The OpenAI API key is read from the app's private installation parameters
 * (context.appInstallation.parameters.private.openAiApiKey).
 *
 * Docs:
 *   https://www.contentful.com/developers/docs/extensibility/app-framework/functions/
 *   https://www.contentful.com/developers/docs/extensibility/app-framework/app-parameters/#private-installation-parameters
 */
import {
  FunctionEventHandler,
  FunctionTypeEnum,
  FunctionEventContext,
} from '@contentful/node-apps-toolkit';
import { proxyAiAction } from './_aiActionProxy';
import { getOpenAiApiKey } from './_params';

interface GradeContentParams {
  entryId: string;
  title: string;
  body: string;
  contentType: string;
  brandVoice?: string;
  aiActionId?: string;
}

interface GradeContentResponse {
  score: number;
  summary: string;
  suggestions: string[];
  toneScore?: number;
  toneFeedback?: string;
}

const SYSTEM_PROMPT = `You are a content quality analyst. You will receive a piece of content and return a JSON object (no markdown fences) with exactly these fields:
- score: integer 0–100 reflecting overall content quality (completeness, clarity, SEO readiness, tone)
- summary: 1–2 sentence plain-text description of the content's strengths and weaknesses
- suggestions: array of 3–5 short, actionable improvement recommendations
- toneScore: integer 0–100 reflecting how well the content matches the brand voice (100 if no brand voice provided)
- toneFeedback: one sentence on tone alignment (empty string if no brand voice provided)

Scoring guide:
- 75–100: Clear, complete, well-structured, good length, strong messaging
- 50–74: Usable but missing key elements (description, CTAs, sufficient length)
- 0–49: Thin, unclear, or largely incomplete content`;

export const handler: FunctionEventHandler<FunctionTypeEnum.AppActionCall> = async (
  event,
  context: FunctionEventContext,
) => {
  try {
  const params = event.body as unknown as GradeContentParams;
  const { title = '', body = '', contentType = '', brandVoice = '', aiActionId = '' } = params;

  // Path A: proxy a Contentful AI Action server-side (no OpenAI key needed)
  if (aiActionId) {
    const brandVoiceNote = brandVoice ? `\nBrand voice: ${brandVoice}` : '';
    const entryText = `Content type: ${contentType}\nTitle: ${title}${brandVoiceNote}\nBody:\n${body.slice(0, 3000)}`;
    const raw = await proxyAiAction(context, aiActionId, { text: entryText });

    // Try JSON first (legacy), then parse the plain-text format
    let score = 0;
    let summary = '';
    const suggestions: string[] = [];

    let jsonParsed = false;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.score === 'number') {
        score = Math.min(100, Math.max(0, parsed.score));
        summary = parsed.summary ?? '';
        if (Array.isArray(parsed.suggestions)) suggestions.push(...parsed.suggestions.slice(0, 6));
        jsonParsed = true;
      }
    } catch { /* fall through to plain text parsing */ }

    if (!jsonParsed) {
      // Parse the structured plain-text format:
      // "QUALITY SCORE\n75 — Good\n\nSUMMARY\n...\n\nTOP SUGGESTIONS\n1. ...\n2. ..."
      const scoreMatch = raw.match(/QUALITY SCORE\s*\n\s*(\d+)/i);
      if (scoreMatch) score = Math.min(100, Math.max(0, parseInt(scoreMatch[1], 10)));

      const summaryMatch = raw.match(/SUMMARY\s*\n([\s\S]*?)(?=\nCOMPLETENESS|\nREADABILITY|\nSEO READINESS|\nTOP SUGGESTIONS|$)/i);
      if (summaryMatch) summary = summaryMatch[1].trim();

      const suggestionsMatch = raw.match(/TOP SUGGESTIONS\s*\n([\s\S]*?)(?=\n[A-Z ]+\n|$)/i);
      if (suggestionsMatch) {
        const lines = suggestionsMatch[1].split('\n').map(l => l.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
        suggestions.push(...lines.slice(0, 6));
      }

      if (!summary) summary = raw.slice(0, 400);
    }

    return {
      score,
      summary,
      suggestions,
      toneScore: undefined,
      toneFeedback: undefined,
    } satisfies GradeContentResponse;
  }

  const apiKey = getOpenAiApiKey(context);

  if (!apiKey) {
    return {
      score: 0,
      summary: 'No AI configured. Enter a Content Audit AI Action ID or OpenAI key in Config Screen → App Functions.',
      suggestions: ['Add the Content Quality Audit AI Action ID in Config Screen → App Functions → Content Audit.'],
      toneScore: 100,
      toneFeedback: '',
    } satisfies GradeContentResponse;
  }

  const brandVoiceSection = brandVoice
    ? `\nBrand voice guidelines: ${brandVoice}`
    : '';

  const userMessage = `Content type: ${contentType}
Title: ${title}${brandVoiceSection}
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
      max_tokens: 500,
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

  let parsed: Partial<GradeContentResponse>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  return {
    score: typeof parsed.score === 'number' ? Math.min(100, Math.max(0, parsed.score)) : 0,
    summary: parsed.summary ?? 'No summary returned.',
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 5) : [],
    toneScore: typeof parsed.toneScore === 'number' ? Math.min(100, Math.max(0, parsed.toneScore)) : undefined,
    toneFeedback: typeof parsed.toneFeedback === 'string' ? parsed.toneFeedback : undefined,
  } satisfies GradeContentResponse;
  } catch (err: any) {
    return {
      score: 0,
      summary: `Function error: ${err?.message ?? 'Unknown error'}`,
      suggestions: [],
    };
  }
};
