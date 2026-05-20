/**
 * Extracts just the action ID from a Contentful AI Action URL or plain ID.
 *
 * Accepts any of:
 *   https://app.contentful.com/spaces/.../ai_actions/4LbT2NLhRnGixGSbuDuL1n
 *   4LbT2NLhRnGixGSbuDuL1n
 */
export function extractAiActionId(input: string): string {
  const match = input.match(/\/ai_actions\/([^/?#\s]+)/);
  return match ? match[1] : input.trim();
}

/**
 * Invokes an App Action (backed by an App Function) and returns the response body.
 *
 * Uses cma.appActionCall.createWithResponse() — the same mechanism whether the
 * action is backed by an App Function or an external endpoint.
 *
 * Docs:
 *   https://www.contentful.com/developers/docs/extensibility/app-framework/app-actions/
 *   https://www.contentful.com/developers/docs/extensibility/app-framework/functions/#use-case-app-actions
 */
export async function invokeAppActionAndWait<T = Record<string, unknown>>(
  cma: any,
  appDefinitionId: string,
  actionId: string,
  parameters: Record<string, unknown>,
): Promise<T> {
  const result = await cma.appActionCall.createWithResponse(
    { appActionId: actionId, appDefinitionId },
    { parameters },
  );
  const rawBody = result?.response?.body ?? result?.body ?? '{}';
  const parsed = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  return parsed as T;
}

/**
 * Returns true if the given ID looks like a Contentful AI Action ID
 * (base62, 20–24 chars, mix of upper+lower+digits, no hyphens or underscores)
 * rather than an App Action ID (camelCase slug like "gradeContent", or
 * hyphenated like "grade-content").
 *
 * AI Action IDs are random base62 strings, e.g. "5HAn6AVCxsbxddb5ahQpKs".
 * App Action IDs are human-readable, e.g. "gradeContent" or "grade-content".
 *
 * Heuristic: AI Action IDs are 20–24 chars AND contain both digits and
 * mixed-case letters (the randomness signature). App Action IDs are typically
 * shorter or purely alphabetic camelCase.
 */
export function isAiActionId(id: string): boolean {
  return (
    id.length >= 20 &&
    id.length <= 26 &&
    /[0-9]/.test(id) &&
    /[A-Z]/.test(id) &&
    /[a-z]/.test(id) &&
    /^[A-Za-z0-9]+$/.test(id)
  );
}

/**
 * Sentinel error thrown when the App SDK blocks AiAction entity access.
 * Callers should catch this and fall back to opening the entry/asset in Contentful.
 */
export class AiActionNotPermittedError extends Error {
  constructor() {
    super('AiAction access is not permitted from within a Contentful App. Open the entry in Contentful to use the native AI action buttons.');
    this.name = 'AiActionNotPermittedError';
  }
}

interface AiActionContext {
  entryId?: string;
  assetId?: string;
  targetLocale?: string;
  sourceLocale?: string;
}

/**
 * Invokes a Contentful AI Action and polls until it completes.
 *
 * Uses the proper SDK methods:
 *   - cma.aiAction.get()    — fetch the action definition (variable IDs + types)
 *   - cma.aiAction.invoke() — start the invocation
 *   - cma.aiActionInvocation.get() — poll status
 *
 * Variables are mapped automatically from the action's declared variable types:
 *   Reference / ResourceLink  → entry ID
 *   MediaReference            → asset ID
 *   Locale                    → target locale (first var) / source locale (second var)
 *   Text / StandardInput      → source locale string (fallback label)
 *
 * The action is expected to write results back to the entry/asset itself.
 * The caller should invalidate its data cache after this resolves.
 *
 * Returns the action's plain-text result content (may be empty if action
 * writes directly to the entry rather than returning content).
 */
export async function invokeAiActionAndWait(
  cma: any,
  spaceId: string,
  environmentId: string,
  actionId: string,
  context: AiActionContext,
  timeoutMs = 90_000,
): Promise<string> {
  // 1 — Fetch the action definition to learn its variable IDs and types
  let actionDef: any;
  try {
    actionDef = await cma.aiAction.get({ spaceId, aiActionId: actionId });
  } catch (err: any) {
    // The App SDK blocks AiAction access — throw a typed error so callers can degrade gracefully
    if (err?.message?.includes('AiAction') || err?.status === 403) {
      throw new AiActionNotPermittedError();
    }
    throw err;
  }
  const vars: Array<{ id: string; type: string }> = actionDef.instruction?.variables ?? [];

  // 2 — Map context values onto variable IDs by their declared type
  let localeVarCount = 0;
  type VarEntry = { id: string; value: string | { entityType: 'Entry' | 'Asset'; entityId: string; entityPath: string } };

  const variablePayload: VarEntry[] = [];
  for (const v of vars) {
    switch (v.type) {
      case 'Reference':
      case 'ResourceLink':
        if (context.entryId) {
          variablePayload.push({ id: v.id, value: { entityType: 'Entry', entityId: context.entryId, entityPath: '' } });
        }
        break;
      case 'MediaReference':
        if (context.assetId) {
          variablePayload.push({ id: v.id, value: { entityType: 'Asset', entityId: context.assetId, entityPath: '' } });
        }
        break;
      case 'Locale': {
        const localeValue = localeVarCount === 0
          ? (context.targetLocale ?? context.sourceLocale ?? '')
          : (context.sourceLocale ?? context.targetLocale ?? '');
        localeVarCount++;
        if (localeValue) variablePayload.push({ id: v.id, value: localeValue });
        break;
      }
      case 'Text':
      case 'StandardInput':
        if (context.sourceLocale) variablePayload.push({ id: v.id, value: context.sourceLocale });
        break;
      default:
        break;
    }
  }

  // 3 — Invoke the action
  const invocation = await cma.aiAction.invoke(
    { spaceId, environmentId, aiActionId: actionId },
    { outputFormat: 'PlainText', variables: variablePayload },
  );

  // 4 — Poll until COMPLETED or FAILED (max timeoutMs)
  const deadline = Date.now() + timeoutMs;
  let current = invocation;

  while (current.sys.status === 'SCHEDULED' || current.sys.status === 'IN_PROGRESS') {
    if (Date.now() > deadline) throw new Error('AI Action timed out after 90 s.');
    await new Promise((r) => setTimeout(r, 2000));
    current = await cma.aiActionInvocation.get({
      spaceId,
      environmentId,
      aiActionId: actionId,
      invocationId: current.sys.id,
    });
  }

  if (current.sys.status === 'FAILED') {
    throw new Error(`AI Action failed (${current.sys.errorCode ?? 'unknown error'})`);
  }

  return typeof current.result?.content === 'string' ? current.result.content : '';
}
