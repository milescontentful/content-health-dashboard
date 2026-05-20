/**
 * App Function: translateFields
 *
 * Translates all localizable text fields of an entry from a source locale to a
 * target locale, then writes the results back to the entry as a draft.
 *
 * Accepts:
 *   {
 *     entryId:      string,
 *     sourceLocale: string,   // e.g. "en-US"
 *     targetLocale: string,   // e.g. "de-DE"
 *     aiActionId?:  string,   // Contentful AI Action ID to proxy (preferred)
 *   }
 *
 * Returns:
 *   { translatedCount: number, skippedCount: number }
 *
 * The function fetches the entry and its content type server-side, filters to
 * fields where localized=true and type is Symbol or Text, then for each field:
 *   - if aiActionId is set: calls proxyAiAction() with the field's text
 *   - otherwise: calls OpenAI directly (requires openAiApiKey in private params)
 * Results are written back to the entry before returning.
 */
import {
  FunctionEventHandler,
  FunctionTypeEnum,
  FunctionEventContext,
} from '@contentful/node-apps-toolkit';
import { proxyAiAction } from './_aiActionProxy';

interface TranslateFieldsParams {
  entryId: string;
  sourceLocale?: string;
  targetLocale: string;
  /** Contentful AI Action ID — proxied server-side, no OpenAI key needed. */
  aiActionId?: string;
}

interface TranslateFieldsResponse {
  translatedCount: number;
  skippedCount: number;
  error?: string;
}

const TRANSLATABLE_FIELD_TYPES = new Set(['Symbol', 'Text']);

export const handler: FunctionEventHandler<FunctionTypeEnum.AppActionCall> = async (
  event,
  context: FunctionEventContext,
): Promise<TranslateFieldsResponse> => {
  try {
  const params = event.body as unknown as TranslateFieldsParams;
  const { entryId, sourceLocale = 'en-US', targetLocale, aiActionId } = params;

  if (!targetLocale) {
    return { translatedCount: 0, skippedCount: 0, error: 'targetLocale is required.' };
  }

  const cma = context.cma;
  const spaceId: string = context.spaceId;
  const environmentId: string = context.environmentId;

  const entry = await cma.entry.get({ entryId, spaceId, environmentId });
  const contentTypeId: string = entry.sys.contentType.sys.id;
  const ct = await cma.contentType.get({ contentTypeId, spaceId, environmentId });

  // Only translate fields that have localization enabled AND are plain text
  const localizableFields: Array<{ id: string; type: string }> = (ct.fields as any[]).filter(
    (f) => f.localized && TRANSLATABLE_FIELD_TYPES.has(f.type),
  );

  if (localizableFields.length === 0) {
    return {
      translatedCount: 0,
      skippedCount: 0,
      error: `Content type "${contentTypeId}" has no localizable text fields.`,
    };
  }

  const privateParams = (context.appInstallationParameters as any)?.private ?? {};
  const apiKey: string | undefined = privateParams.openAiApiKey;

  if (!aiActionId && !apiKey) {
    return {
      translatedCount: 0,
      skippedCount: 0,
      error: 'No AI Action ID or OpenAI API key configured. Add one in Config Screen → App Functions.',
    };
  }

  let translatedCount = 0;
  let skippedCount = 0;

  for (const field of localizableFields) {
    const sourceText = (entry.fields[field.id] as any)?.[sourceLocale];
    if (!sourceText || typeof sourceText !== 'string' || !sourceText.trim()) {
      skippedCount++;
      continue;
    }

    try {
      let translatedText: string;

      if (aiActionId) {
        // Proxy the Contentful AI Action server-side — passes the field text as
        // the Content variable and both locales to the action.
        translatedText = await proxyAiAction(context, aiActionId, {
          text: sourceText,
          sourceLocale,
          targetLocale,
        });
      } else {
        // Direct OpenAI fallback
        translatedText = await translateWithOpenAi(apiKey!, sourceText, sourceLocale, targetLocale);
      }

      if (translatedText.trim()) {
        if (!entry.fields[field.id]) entry.fields[field.id] = {};
        (entry.fields[field.id] as any)[targetLocale] = translatedText.trim();
        translatedCount++;
      } else {
        skippedCount++;
      }
    } catch {
      skippedCount++;
    }
  }

  if (translatedCount > 0) {
    await cma.entry.update({ entryId, spaceId, environmentId }, entry);
  }

  return { translatedCount, skippedCount } satisfies TranslateFieldsResponse;
  } catch (err: any) {
    return { translatedCount: 0, skippedCount: 0, error: `Function error: ${err?.message ?? String(err)}` };
  }
};

async function translateWithOpenAi(
  apiKey: string,
  text: string,
  sourceLocale: string,
  targetLocale: string,
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 2000,
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate from ${sourceLocale} to ${targetLocale}. Return ONLY the translated text with no explanation, quotes, or formatting.`,
        },
        { role: 'user', content: text },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${err.slice(0, 200)}`);
  }

  const json = await response.json();
  return json.choices?.[0]?.message?.content ?? '';
}
