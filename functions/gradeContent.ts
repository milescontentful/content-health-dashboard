/**
 * App Function: gradeContent
 *
 * Linked App Action ID: grade-content
 *
 * Accepts:
 *   { entryId: string, title: string, body: string, contentType: string,
 *     brandVoice?: string, aiActionId?: string }
 *
 * Returns:
 *   { score: number (0–100), summary: string, suggestions: string[] }
 *
 * Grading runs via a Contentful AI Action proxy (aiActionId) or the OpenAI
 * API (openAiApiKey installation parameter) — see functions/_grading.ts.
 *
 * Docs:
 *   https://www.contentful.com/developers/docs/extensibility/app-framework/functions/
 */
import {
  FunctionEventHandler,
  FunctionTypeEnum,
  FunctionEventContext,
} from '@contentful/node-apps-toolkit';
import { gradeText, GradeResult } from './_grading';

interface GradeContentParams {
  entryId: string;
  title: string;
  body: string;
  contentType: string;
  brandVoice?: string;
  aiActionId?: string;
}

export const handler: FunctionEventHandler<FunctionTypeEnum.AppActionCall> = async (
  event,
  context: FunctionEventContext,
): Promise<GradeResult> => {
  try {
    const params = event.body as unknown as GradeContentParams;
    const { title = '', body = '', contentType = '', brandVoice = '', aiActionId = '' } = params;

    const result = await gradeText(context, { title, body, contentType, brandVoice, aiActionId });
    if (!result) {
      return {
        score: 0,
        summary: 'No AI configured. Enter a Content Audit AI Action ID or OpenAI key in Config Screen → App Functions.',
        suggestions: ['Add the Content Quality Audit AI Action ID in Config Screen → App Functions → Content Audit.'],
        toneScore: 100,
        toneFeedback: '',
      };
    }
    return result;
  } catch (err: any) {
    return {
      score: 0,
      summary: `Function error: ${err?.message ?? 'Unknown error'}`,
      suggestions: [],
    };
  }
};
