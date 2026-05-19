import { useState } from 'react';
import { useSDK } from '@contentful/react-apps-toolkit';
import { useQuery } from '@tanstack/react-query';
import {
  Flex,
  Text,
  TextInput,
  Button,
  Select,
  FormControl,
  Spinner,
  Note,
  Card,
  Badge,
  Table,
  IconButton,
  Stack,
} from '@contentful/f36-components';
import { PlusIcon, TrashSimpleIcon, MagnifyingGlassIcon } from '@contentful/f36-icons';
import { useSearchEntries } from '../../hooks/useSearchEntries';
import { setFieldMetaCache } from '../../utils/queryBuilder';
import type { SearchQuery, SearchCondition } from '../types';

const OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'exists', label: 'exists' },
  { value: 'not_exists', label: 'does not exist' },
  { value: 'before', label: 'before (date)' },
  { value: 'after', label: 'after (date)' },
] as const;

const BOOLEAN_OPS = ['AND', 'OR', 'NOT'] as const;

const SYSTEM_FIELDS = [
  { value: 'sys.id', label: 'Entry ID' },
  { value: 'sys.createdAt', label: 'Created at' },
  { value: 'sys.updatedAt', label: 'Updated at' },
  { value: 'sys.publishedAt', label: 'Published at' },
  { value: 'sys.firstPublishedAt', label: 'First published at' },
  { value: 'sys.createdBy.sys.id', label: 'Created by (ID)' },
];

function emptyCondition(): SearchCondition {
  return { id: crypto.randomUUID(), field: 'sys.id', operator: 'equals', value: '', booleanOp: 'AND' };
}

function entryStatus(entry: any): string {
  if (!entry.sys.publishedAt) return 'Draft';
  if (entry.sys.publishedAt && entry.sys.updatedAt > entry.sys.publishedAt) return 'Changed';
  return 'Published';
}

export function SearchBuilder() {
  const sdk = useSDK();

  const [freeText, setFreeText] = useState('');
  const [contentTypeId, setContentTypeId] = useState('');
  const [conditions, setConditions] = useState<SearchCondition[]>([]);
  const [activeQuery, setActiveQuery] = useState<SearchQuery | null>(null);
  const [page, setPage] = useState(0);
  const limit = 25;

  const { data: ctData } = useQuery({
    queryKey: ['content-types-search'],
    queryFn: async () => {
      const res = await (sdk.cma as any).contentType.getMany({ query: { limit: 200 } });
      return res.items as Array<{ sys: { id: string }; name: string; fields: Array<{ id: string; name: string; type: string }> }>;
    },
  });

  const selectedCt = ctData?.find((ct) => ct.sys.id === contentTypeId);

  // Populate field meta cache when CT changes
  if (selectedCt) {
    setFieldMetaCache(selectedCt.sys.id, selectedCt.fields.map((f) => ({ id: f.id, type: f.type })));
  }

  const ctFields = selectedCt?.fields ?? [];
  const fieldOptions = [
    ...SYSTEM_FIELDS,
    ...ctFields.map((f) => ({ value: `fields.${f.id}`, label: f.name })),
  ];

  const { entries, total, isFetching } = useSearchEntries(activeQuery, page * limit, limit);

  const addCondition = () => setConditions((c) => [...c, emptyCondition()]);
  const removeCondition = (id: string) => setConditions((c) => c.filter((x) => x.id !== id));
  const updateCondition = (id: string, patch: Partial<SearchCondition>) =>
    setConditions((c) => c.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const runSearch = () => {
    setPage(0);
    setActiveQuery({ freeText, contentType: contentTypeId || undefined, conditions });
  };

  const noValueOperators = ['exists', 'not_exists'];

  return (
    <Flex flexDirection="column" gap="spacingM">
      <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">Content Search</Text>

      <Card padding="default">
        <Stack flexDirection="column" spacing="spacingM">
          <Flex gap="spacingM" alignItems="flex-end" flexWrap="wrap">
            <FormControl style={{ flex: 1, marginBottom: 0 }}>
              <FormControl.Label>Free text</FormControl.Label>
              <TextInput
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                placeholder="Search across all fields…"
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              />
            </FormControl>

            <FormControl style={{ minWidth: 200, marginBottom: 0 }}>
              <FormControl.Label>Content type</FormControl.Label>
              <Select value={contentTypeId} onChange={(e) => setContentTypeId(e.target.value)}>
                <Select.Option value="">All types</Select.Option>
                {ctData?.map((ct) => (
                  <Select.Option key={ct.sys.id} value={ct.sys.id}>{ct.name}</Select.Option>
                ))}
              </Select>
            </FormControl>
          </Flex>

          {/* Conditions */}
          {conditions.map((cond) => (
            <Flex key={cond.id} gap="spacingS" alignItems="center" flexWrap="wrap">
              <Select value={cond.booleanOp} onChange={(e) => updateCondition(cond.id, { booleanOp: e.target.value as SearchCondition['booleanOp'] })} style={{ width: 80 }}>
                {BOOLEAN_OPS.map((op) => <Select.Option key={op} value={op}>{op}</Select.Option>)}
              </Select>

              <Select value={cond.field} onChange={(e) => updateCondition(cond.id, { field: e.target.value })} style={{ minWidth: 180 }}>
                {fieldOptions.map((f) => <Select.Option key={f.value} value={f.value}>{f.label}</Select.Option>)}
              </Select>

              <Select value={cond.operator} onChange={(e) => updateCondition(cond.id, { operator: e.target.value as SearchCondition['operator'] })} style={{ minWidth: 160 }}>
                {OPERATORS.map((op) => <Select.Option key={op.value} value={op.value}>{op.label}</Select.Option>)}
              </Select>

              {!noValueOperators.includes(cond.operator) && (
                <TextInput
                  value={cond.value}
                  onChange={(e) => updateCondition(cond.id, { value: e.target.value })}
                  placeholder="Value"
                  style={{ flex: 1, minWidth: 120 }}
                />
              )}

              <IconButton variant="transparent" icon={<TrashSimpleIcon />} aria-label="Remove condition" onClick={() => removeCondition(cond.id)} />
            </Flex>
          ))}

          <Flex gap="spacingS">
            <Button variant="secondary" size="small" startIcon={<PlusIcon />} onClick={addCondition}>
              Add condition
            </Button>
            <Button variant="primary" startIcon={<MagnifyingGlassIcon />} onClick={runSearch} isLoading={isFetching}>
              Search
            </Button>
          </Flex>
        </Stack>
      </Card>

      {/* Results */}
      {activeQuery && (
        <>
          {isFetching && <Flex justifyContent="center"><Spinner /></Flex>}

          {!isFetching && entries.length === 0 && (
            <Note variant="neutral">No entries match your query.</Note>
          )}

          {!isFetching && entries.length > 0 && (
            <>
              <Text fontColor="gray600">{total} result{total !== 1 ? 's' : ''}</Text>
              <Table>
                <Table.Head>
                  <Table.Row>
                    <Table.Cell>Title / ID</Table.Cell>
                    <Table.Cell>Content type</Table.Cell>
                    <Table.Cell>Status</Table.Cell>
                    <Table.Cell>Updated</Table.Cell>
                  </Table.Row>
                </Table.Head>
                <Table.Body>
                  {entries.map((entry) => {
                    const firstField = Object.values(entry.fields)[0] as any;
                    const title = firstField ? Object.values(firstField)[0] as string : entry.sys.id;
                    const status = entryStatus(entry);
                    return (
                      <Table.Row key={entry.sys.id}>
                        <Table.Cell>
                          <Text
                            as="span"
                            style={{ cursor: 'pointer', color: '#1773EB', textDecoration: 'underline' }}
                            onClick={() => (sdk as any).navigator?.openEntry(entry.sys.id, { slideIn: true })}
                          >
                            {title || entry.sys.id}
                          </Text>
                        </Table.Cell>
                        <Table.Cell>{entry.sys.contentType.sys.id}</Table.Cell>
                        <Table.Cell>
                          <Badge variant={status === 'Published' ? 'positive' : status === 'Changed' ? 'warning' : 'secondary'}>
                            {status}
                          </Badge>
                        </Table.Cell>
                        <Table.Cell>{new Date(entry.sys.updatedAt).toLocaleDateString()}</Table.Cell>
                      </Table.Row>
                    );
                  })}
                </Table.Body>
              </Table>

              {/* Pagination */}
              <Flex justifyContent="space-between" alignItems="center">
                <Button size="small" variant="secondary" isDisabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Text fontColor="gray600">Page {page + 1} of {Math.max(1, Math.ceil(total / limit))}</Text>
                <Button size="small" variant="secondary" isDisabled={(page + 1) * limit >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </Flex>
            </>
          )}
        </>
      )}
    </Flex>
  );
}
