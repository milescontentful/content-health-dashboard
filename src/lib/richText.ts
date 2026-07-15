/** Recursively extract plain text from a Contentful Rich Text document. */
export function extractRichText(node: any): string {
  if (!node) return '';
  if (typeof node.value === 'string') return node.value;
  if (Array.isArray(node.content)) return node.content.map(extractRichText).join(' ');
  return '';
}
