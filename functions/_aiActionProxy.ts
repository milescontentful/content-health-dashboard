/**
 * Server-side AI Action proxy for App Functions.
 *
 * Contentful AI Actions cannot be invoked from the browser (iframe) when called
 * from within a Contentful App. App Functions run on Contentful's server-side
 * infrastructure and have no such restriction — this helper invokes an AI Action
 * using the CMA client injected into the function context.
 */
import { FunctionEventContext } from '@contentful/node-apps-toolkit';

interface AiActionVariables {
  /** Plain text content to process (e.g. the field value to translate or describe). */
  text?: string;
  entryId?: string;
  assetId?: string;
  targetLocale?: string;
  sourceLocale?: string;
}

export async function proxyAiAction(
  context: FunctionEventContext,
  aiActionId: string,
  variables: AiActionVariables,
  timeoutMs = 90_000,
): Promise<string> {
  const cma = context.cma;
  const spaceId: string = context.spaceId;
  const environmentId: string = context.environmentId;

  // 1. Fetch the action definition to learn its variable IDs and types
  const actionDef = await cma.aiAction.get({ spaceId, aiActionId });
  const vars: Array<{ id: string; type: string }> = actionDef.instruction?.variables ?? [];

  // 2. Map context values onto variable IDs by their declared type
  type VarEntry = {
    id: string;
    value: string | { entityType: 'Entry' | 'Asset'; entityId: string; entityPath: string };
  };
  const variablePayload: VarEntry[] = [];

  for (const v of vars) {
    const varIdLower = v.id.toLowerCase();

    switch (v.type) {
      case 'Reference':
      case 'ResourceLink':
        if (variables.entryId) {
          variablePayload.push({
            id: v.id,
            value: { entityType: 'Entry', entityId: variables.entryId, entityPath: '' },
          });
        }
        break;

      case 'MediaReference':
        if (variables.assetId) {
          variablePayload.push({
            id: v.id,
            value: { entityType: 'Asset', entityId: variables.assetId, entityPath: '' },
          });
        }
        break;

      case 'Locale': {
        // Use variable ID name to distinguish source from target locale.
        // Fallback: first Locale variable → source, second → target.
        let localeValue: string;
        if (varIdLower.includes('source')) {
          localeValue = variables.sourceLocale ?? '';
        } else if (varIdLower.includes('target')) {
          localeValue = variables.targetLocale ?? '';
        } else {
          // position-based fallback
          const localeCount = variablePayload.filter(
            vp => vars.find(vd => vd.id === vp.id)?.type === 'Locale',
          ).length;
          localeValue =
            localeCount === 0
              ? (variables.sourceLocale ?? variables.targetLocale ?? '')
              : (variables.targetLocale ?? variables.sourceLocale ?? '');
        }
        if (localeValue) variablePayload.push({ id: v.id, value: localeValue });
        break;
      }

      case 'Text':
      case 'StandardInput':
        // Pass the actual content text to process (field value, image URL, etc.)
        if (variables.text) {
          variablePayload.push({ id: v.id, value: variables.text });
        }
        break;
    }
  }

  // 3. Invoke the action
  const invocation = await cma.aiAction.invoke(
    { spaceId, environmentId, aiActionId },
    { outputFormat: 'PlainText', variables: variablePayload },
  );

  // 4. Poll until COMPLETED or FAILED
  const deadline = Date.now() + timeoutMs;
  let current = invocation;

  while (current.sys.status === 'SCHEDULED' || current.sys.status === 'IN_PROGRESS') {
    if (Date.now() > deadline) throw new Error('AI Action timed out after 90s.');
    await new Promise((r) => setTimeout(r, 2000));
    current = await cma.aiActionInvocation.get({
      spaceId,
      environmentId,
      aiActionId,
      invocationId: current.sys.id,
    });
  }

  if (current.sys.status === 'FAILED') {
    throw new Error(`AI Action failed: ${current.sys.errorCode ?? 'unknown error'}`);
  }

  return typeof current.result?.content === 'string' ? current.result.content : '';
}
