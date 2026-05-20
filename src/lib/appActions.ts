/**
 * App Action sys.id lookup keyed by function ID.
 *
 * These IDs are tied to the App Definition (not per-space), so they are the
 * same regardless of which space the app is installed in. The IDs come from
 * contentful-app-manifest.json and are kept in sync via:
 *
 *   npm run upsert-actions
 *
 * Which regenerates the manifest entries and should be followed by a rebuild.
 */
import manifest from '../../contentful-app-manifest.json';

type ManifestAction = { id?: string; functionId?: string };

const ACTION_IDS: Record<string, string> = (
  (manifest as { actions?: ManifestAction[] }).actions ?? []
).reduce<Record<string, string>>((acc, action) => {
  if (action.id && action.functionId) {
    acc[action.functionId] = action.id;
  }
  return acc;
}, {});

/** Returns the App Action sys.id for a given function ID. */
export function getAppActionId(functionId: string): string {
  const id = ACTION_IDS[functionId];
  if (!id) throw new Error(`No App Action found for function "${functionId}". Run npm run upsert-actions.`);
  return id;
}

export const APP_ACTION_IDS = {
  translateFields: ACTION_IDS['translateFields'] ?? '',
  generateAltText: ACTION_IDS['generateAltText'] ?? '',
  gradeContent: ACTION_IDS['gradeContent'] ?? '',
  seoAudit: ACTION_IDS['seoAudit'] ?? '',
} as const;
