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

interface GradeContentParams {
  entryId: string;
  title: string;
  body: string;
  contentType: string;
  brandVoice?: string;
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
  const { title = '', body = '', contentType = '', brandVoice = '' } = params;

  const apiKey: string = (context.appInstallationParameters as any)?.openAiApiKey ?? '';

  if (!apiKey) {
    return {
      score: 0,
      summary: 'OpenAI API key not configured. Add it in Config Screen → App Functions.',
      suggestions: ['Configure your OpenAI API key in the app Config Screen to enable AI grading.'],
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
