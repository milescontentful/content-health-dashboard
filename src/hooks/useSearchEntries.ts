import { useQuery } from '@tanstack/react-query';
import { useSDK } from '@contentful/react-apps-toolkit';
import type { SearchQuery } from '../modules/types';
import { buildCMAQuery, deduplicateEntries } from '../utils/queryBuilder';

interface EntryItem {
  sys: {
    id: string;
    createdAt: string;
    updatedAt: string;
    publishedAt?: string;
    firstPublishedAt?: string;
    contentType: { sys: { id: string } };
    locale?: string;
  };
  fields: Record<string, unknown>;
}

interface SearchResult {
  entries: EntryItem[];
  total: number;
}

async function executeSearch(
  cma: ReturnType<typeof useSDK>['cma'],
  search: SearchQuery,
  skip = 0,
  limit = 25,
): Promise<SearchResult> {
  const queries = buildCMAQuery(search);

  if (queries.length === 1) {
    const response = await (cma as any).entry.getMany({
      query: { ...queries[0], skip, limit, order: '-sys.updatedAt' },
    });
    return { entries: response.items as EntryItem[], total: response.total ?? 0 };
  }

  const results = await Promise.all(
    queries.map((q) =>
      (cma as any).entry.getMany({ query: { ...q, skip: 0, limit: 100, order: '-sys.updatedAt' } }),
    ),
  );

  const all = results.flatMap((r) => r.items as EntryItem[]);
  const deduped = deduplicateEntries(all);
  return { entries: deduped.slice(skip, skip + limit), total: deduped.length };
}

export function useSearchEntries(search: SearchQuery | null, skip = 0, limit = 25) {
  const sdk = useSDK();

  const { data, isFetching, error, refetch } = useQuery<SearchResult>({
    queryKey: ['search', JSON.stringify(search), skip, limit],
    queryFn: () => executeSearch(sdk.cma, search!, skip, limit),
    enabled: !!sdk.cma && search !== null,
  });

  return {
    entries: data?.entries ?? [],
    total: data?.total ?? 0,
    isFetching,
    error,
    refetch,
  };
}
