// Field-completeness heuristics — pure, reused by the AI Audit module and the
// entry sidebar's live health score.

export interface CompletenessIssue {
  field: string;
  issue: string;
}

export function checkCompleteness(
  entry: any,
  ct: { fields: Array<{ id: string; name: string; type: string; required?: boolean }> },
  defaultLocale: string,
): CompletenessIssue[] {
  const issues: CompletenessIssue[] = [];
  for (const field of ct.fields) {
    const val = entry.fields[field.id]?.[defaultLocale];
    const isEmpty = val === undefined || val === null || val === '' ||
      (Array.isArray(val) && val.length === 0) ||
      (typeof val === 'object' && val !== null && val.nodeType === 'document' && val.content?.length === 0);
    if (isEmpty) {
      issues.push({
        field: field.name,
        issue: field.required ? 'Required field is empty' : 'Optional field is empty',
      });
    } else if ((field.type === 'Symbol' || field.type === 'Text') && typeof val === 'string' && val.trim().length < 10) {
      issues.push({ field: field.name, issue: 'Value is very short (< 10 chars)' });
    }
  }
  return issues;
}
