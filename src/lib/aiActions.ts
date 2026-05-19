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
 * Invokes a Contentful AI Action and returns its output.
 *
 * Contentful AI Actions live at a different endpoint than App Framework App Actions:
 *   POST /spaces/{spaceId}/environments/{envId}/ai_actions/{actionId}/invocations
 *
 * The `variables` map is passed as rawVariables — keys should match the variable IDs
 * defined in the AI Action configuration in Contentful.
 */
export async function invokeAiAction(
  cma: any,
  spaceId: string,
  environmentId: string,
  actionId: string,
  variables: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const path = `/spaces/${spaceId}/environments/${environmentId}/ai_actions/${actionId}/invocations`;

  const result = await cma.raw.post(path, {
    outputFormat: 'PlainText',
    rawVariables: variables,
  });

  return result ?? {};
}
