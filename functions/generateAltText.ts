/**
 * App Function: generateAltText
 *
 * Linked App Action ID: generate-alt-text
 *
 * Accepts:
 *   { assetId: string, imageUrl: string }
 *
 * Returns:
 *   { altText: string }
 *
 * The caller (AssetHealth module) is responsible for writing the returned altText
 * back to the asset's description field via the CMA.
 *
 * The OpenAI API key is read from the app's private installation parameters
 * (context.appInstallation.parameters.private.openAiApiKey).
 */
import {
  FunctionEventHandler,
  FunctionTypeEnum,
  FunctionEventContext,
} from '@contentful/node-apps-toolkit';
import { proxyAiAction } from './_aiActionProxy';
import { getOpenAiApiKey } from './_params';

interface GenerateAltTextParams {
  assetId: string;
  imageUrl: string;
  /** Optional Contentful AI Action ID to proxy server-side instead of calling OpenAI. */
  aiActionId?: string;
}

interface GenerateAltTextResponse {
  altText: string;
  proxied?: boolean;
  error?: string;
}

export const handler: FunctionEventHandler<FunctionTypeEnum.AppActionCall> = async (
  event,
  context: FunctionEventContext,
): Promise<GenerateAltTextResponse> => {
  try {
  const params = event.body as unknown as GenerateAltTextParams;
  const { assetId, imageUrl = '', aiActionId } = params;

  // If a Contentful AI Action ID is provided, proxy it server-side.
  // The AI Action writes alt text directly back to the asset — no OpenAI key needed.
  if (aiActionId) {
    try {
      await proxyAiAction(context, aiActionId, { assetId });
      return { altText: '', proxied: true } satisfies GenerateAltTextResponse;
    } catch (err: any) {
      return { altText: '', error: `AI Action proxy failed: ${err?.message ?? String(err)}` } satisfies GenerateAltTextResponse;
    }
  }

  const apiKey = getOpenAiApiKey(context);

  if (!apiKey) {
    return {
      altText: '',
      error: 'No AI Action ID or OpenAI API key configured. Add one in Config Screen → App Functions.',
    };
  }

  if (!imageUrl) {
    return { altText: '', error: 'imageUrl is required.' };
  }

  // Ensure the URL is absolute and uses https
  const absoluteUrl = imageUrl.startsWith('//') ? `https:${imageUrl}` : imageUrl;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Write a concise, descriptive alt text for this image. The alt text should be suitable for screen readers, describe the key visual content, and be under 125 characters. Return only the alt text string, no quotes or extra explanation.',
            },
            {
              type: 'image_url',
              image_url: { url: absoluteUrl, detail: 'low' },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const json = await response.json();
  const altText = (json.choices?.[0]?.message?.content ?? '').trim().replace(/^["']|["']$/g, '');

  return { altText } satisfies GenerateAltTextResponse;
  } catch (err: any) {
    return { altText: '', error: `Function error: ${err?.message ?? String(err)}` };
  }
};
