/**
 * Opens a Contentful entry or asset in a new browser tab using the
 * standard web app URL format. Works from any app location.
 */
export function openEntryInNewTab(spaceId: string, environmentId: string, entryId: string) {
  const env = environmentId === 'master' ? '' : `/environments/${environmentId}`;
  window.open(
    `https://app.contentful.com/spaces/${spaceId}${env}/entries/${entryId}`,
    '_blank',
    'noopener,noreferrer',
  );
}

export function openAssetInNewTab(spaceId: string, environmentId: string, assetId: string) {
  const env = environmentId === 'master' ? '' : `/environments/${environmentId}`;
  window.open(
    `https://app.contentful.com/spaces/${spaceId}${env}/assets/${assetId}`,
    '_blank',
    'noopener,noreferrer',
  );
}
