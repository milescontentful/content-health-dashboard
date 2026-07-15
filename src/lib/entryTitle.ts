/** First string value across an entry's fields — safe against reference/object
 *  fields (rendering a link object as a React child crashes the module). */
export function entryTitle(entry: { sys: { id: string }; fields?: Record<string, any> }, preferredLocale?: string): string {
  for (const fieldVal of Object.values(entry.fields ?? {})) {
    if (!fieldVal || typeof fieldVal !== 'object') continue;
    const candidates = preferredLocale && typeof fieldVal[preferredLocale] === 'string'
      ? [fieldVal[preferredLocale]]
      : Object.values(fieldVal);
    for (const v of candidates) {
      if (typeof v === 'string' && v.trim()) return v;
    }
  }
  return entry.sys.id;
}
