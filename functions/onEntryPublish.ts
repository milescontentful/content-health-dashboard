/**
 * App Function: onEntryPublish (App Event handler)
 *
 * Subscribed to ContentManagement.Entry.publish. When an entry is published,
 * grades it with the shared grading core and posts the result as a comment on
 * the entry — the score shows up right where editors work, with zero content
 * model changes.
 *
 * Requires an App Event Subscription targeting this function (see README).
 * Silently does nothing when no AI is configured.
 */
import {
  FunctionEventHandler,
  FunctionTypeEnum,
  FunctionEventContext,
} from '@contentful/node-apps-toolkit';
import { gradeText } from './_grading';

export const handler: FunctionEventHandler<FunctionTypeEnum.AppEventHandler> = async (
  event,
  context: FunctionEventContext,
) => {
  try {
    const topic = String(event.headers['X-Contentful-Topic'] ?? '');
    if (!topic.endsWith('Entry.publish')) return;

    const entry = event.body as any;
    const entryId: string = entry?.sys?.id;
    if (!entryId) return;

    const params = (context.appInstallationParameters ?? {}) as any;
    const aiActionId: string = params.aiActionId ?? '';
    const brandVoice: string = params.brandVoice ?? '';

    // Pull title + body from the published payload (fields are keyed by locale)
    const fields = entry.fields ?? {};
    const firstLocaleValue = (fieldVal: any) =>
      fieldVal && typeof fieldVal === 'object' ? Object.values(fieldVal)[0] : undefined;

    let title = '';
    let body = '';
    for (const fieldVal of Object.values(fields)) {
      const v = firstLocaleValue(fieldVal);
      if (typeof v === 'string' && v.trim()) {
        if (!title) { title = v; continue; }
        if (v.length > body.length) body = v;
      } else if (v && typeof v === 'object' && (v as any).nodeType === 'document') {
        body = extractRichText(v);
      }
    }
    if (!title && !body) return; // nothing gradable

    const result = await gradeText(context, {
      title,
      body: body || title,
      contentType: entry.sys?.contentType?.sys?.id ?? '',
      brandVoice,
      aiActionId,
    });
    if (!result) return; // no AI configured — stay silent

    const suggestionLines = result.suggestions.slice(0, 3).map((s, i) => `${i + 1}. ${s}`).join('\n');
    const commentBody =
      `🩺 Content Health: ${result.score}/100 on publish\n\n` +
      `${result.summary}` +
      (suggestionLines ? `\n\nTop suggestions:\n${suggestionLines}` : '');

    await context.cma.comment.create(
      {
        spaceId: context.spaceId,
        environmentId: context.environmentId,
        entryId,
        bodyFormat: 'plain-text',
      },
      { body: commentBody.slice(0, 512), status: 'active' },
    );
  } catch (err) {
    // Event handlers must not throw for cosmetic failures — log and move on.
    console.error('onEntryPublish failed:', err);
  }
};

function extractRichText(node: any): string {
  if (!node) return '';
  if (typeof node.value === 'string') return node.value;
  if (Array.isArray(node.content)) return node.content.map(extractRichText).join(' ');
  return '';
}
