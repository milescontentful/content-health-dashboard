import type { SearchCondition, SearchQuery } from '../modules/types';

type CMAQueryParams = Record<string, string | number | boolean>;

interface FieldMeta {
  id: string;
  type: string;
}

const _fieldMetaCache = new Map<string, FieldMeta>();

export function setFieldMetaCache(contentTypeId: string, fields: FieldMeta[]) {
  for (const f of fields) {
    _fieldMetaCache.set(`${contentTypeId}:${f.id}`, f);
  }
}

function resolveFieldPath(field: string, contentTypeId?: string): string {
  if (!field.startsWith('fields.')) return field;
  const fieldId = field.replace('fields.', '');
  if (contentTypeId) {
    const meta = _fieldMetaCache.get(`${contentTypeId}:${fieldId}`);
    if (meta && (meta.type === 'Link' || meta.type === 'Array')) {
      return `fields.${fieldId}.sys.id`;
    }
  }
  return field;
}

function conditionToParams(cond: SearchCondition, contentTypeId?: string, negate = false): CMAQueryParams {
  const params: CMAQueryParams = {};
  const fieldPath = resolveFieldPath(cond.field, contentTypeId);

  switch (cond.operator) {
    case 'not_exists':
      params[`${fieldPath}[exists]`] = negate ? true : false;
      break;
    case 'exists':
      params[`${fieldPath}[exists]`] = negate ? false : true;
      break;
    case 'equals':
      if (negate) params[`${fieldPath}[ne]`] = cond.value;
      else params[fieldPath] = cond.value;
      break;
    case 'not_equals':
      params[`${fieldPath}[ne]`] = cond.value;
      break;
    case 'contains':
      params[`${fieldPath}[match]`] = cond.value;
      break;
    case 'before':
      params[`${fieldPath}[lt]`] = cond.value;
      break;
    case 'after':
      params[`${fieldPath}[gt]`] = cond.value;
      break;
    default:
      if (cond.value) params[fieldPath] = cond.value;
  }
  return params;
}

export function buildCMAQuery(search: SearchQuery): CMAQueryParams[] {
  const andConds = search.conditions.filter((c) => c.booleanOp === 'AND');
  const orConds = search.conditions.filter((c) => c.booleanOp === 'OR');
  const notConds = search.conditions.filter((c) => c.booleanOp === 'NOT');

  const base: CMAQueryParams = {};
  if (search.contentType) base.content_type = search.contentType;
  if (search.freeText) base.query = search.freeText;

  const mainQuery = { ...base };
  for (const cond of andConds) Object.assign(mainQuery, conditionToParams(cond, search.contentType));
  for (const cond of notConds) Object.assign(mainQuery, conditionToParams(cond, search.contentType, true));

  if (orConds.length === 0) return [mainQuery];

  return orConds.map((cond) => ({
    ...mainQuery,
    ...conditionToParams(cond, search.contentType),
  }));
}

export function deduplicateEntries<T extends { sys: { id: string } }>(entries: T[]): T[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    if (seen.has(e.sys.id)) return false;
    seen.add(e.sys.id);
    return true;
  });
}
