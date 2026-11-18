import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData
} from '@tanstack/react-query';
import { api } from './client';
import type {
  Category,
  Member,
  Message,
  Organisation,
  OrgSettings,
  Priority,
  Stats,
  StatsRange,
  Status,
  Ticket,
  TicketEvent,
  TicketPage
} from '@triago/shared';

export const QUEUE_VIEWS = {
  pending: ['new'],
  accepted: ['open', 'waiting', 'resolved', 'closed'],
  dismissed: ['dismissed']
} as const satisfies Record<string, readonly Status[]>;

export type QueueView = keyof typeof QUEUE_VIEWS;

export type TicketSort = 'received' | 'triaged';

function ticketsUrl(statuses: readonly Status[], sort: TicketSort, limit: number, cursor: string | null, q = '') {
  const params = new URLSearchParams({ status: statuses.join(','), sort, limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  if (q.trim()) params.set('q', q.trim());
  return `/tickets?${params}`;
}

/** A paginated ticket list, optionally filtered by a search term; call fetchNextPage() to load more. */
export function useTicketPages(
  statuses: readonly Status[],
  sort: TicketSort = 'received',
  q = '',
  /** Milliseconds between background refetches, e.g. while waiting for inbound mail. */
  refetchInterval: number | false = false
) {
  return useInfiniteQuery({
    refetchInterval,
    queryKey: ['tickets', statuses, sort, q.trim()],
    queryFn: ({ pageParam }) => api<TicketPage>(ticketsUrl(statuses, sort, 25, pageParam, q)),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    select: (data) => data.pages.flatMap((page) => page.tickets),
    // While a new search loads, keep the previous results on screen instead of a spinner.
    placeholderData: keepPreviousData
  });
}

export function useTicket(id: string | null) {
  return useQuery({
    queryKey: ['ticket', id],
    queryFn: () => api<{ ticket: Ticket; messages: Message[] }>(`/tickets/${id}`),
    enabled: id !== null
  });
}

/** A ticket's activity log, oldest first. Keyed under ['ticket', id] so ticket changes refresh it. */
export function useTicketEvents(id: string) {
  return useQuery({
    queryKey: ['ticket', id, 'events'],
    queryFn: () => api<{ events: TicketEvent[] }>(`/tickets/${id}/events`).then((data) => data.events)
  });
}

export function useStats(range: StatsRange = 'week', refetchInterval: number | false = false) {
  // Day buckets on the dashboard follow the viewer's time zone.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return useQuery({
    queryKey: ['stats', tz, range],
    queryFn: () => api<Stats>(`/stats?${new URLSearchParams({ tz, range })}`),
    refetchInterval,
    // Keep the old chart on screen while another range loads.
    placeholderData: keepPreviousData
  });
}

export function useOrg() {
  return useQuery({
    queryKey: ['org'],
    queryFn: () => api<{ org: Organisation; members: Member[] }>('/org')
  });
}

/** Any ticket change can move counts on every screen, so refresh them all. */
function useInvalidateTickets() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tickets'] }),
      queryClient.invalidateQueries({ queryKey: ['ticket'] }),
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    ]);
}

export interface TicketEdits {
  title?: string;
  summary?: string;
  category?: Category;
  priority?: Priority;
}

/** Mutation key shared by accept and dismiss, so the queue can show a failure after the row is gone. */
export const TRIAGE_MUTATION_KEY = ['triage'] as const;

/**
 * Optimistic triage: the ticket leaves the pending list and the pending count
 * drops the moment the agent clicks. A failed request puts both back.
 */
function useOptimisticTriage() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTickets();

  return {
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['tickets'] });
      await queryClient.cancelQueries({ queryKey: ['stats'] });
      const snapshot = [
        ...queryClient.getQueriesData({ queryKey: ['tickets'] }),
        ...queryClient.getQueriesData({ queryKey: ['stats'] })
      ];

      // Only the paginated lists that include pending tickets lose the row.
      queryClient.setQueriesData<InfiniteData<TicketPage>>(
        {
          queryKey: ['tickets'],
          predicate: (query) => Array.isArray(query.queryKey[1]) && query.queryKey[1].includes('new')
        },
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((page) => ({ ...page, tickets: page.tickets.filter((ticket) => ticket.id !== id) }))
          }
      );
      queryClient.setQueriesData<Stats>(
        { queryKey: ['stats'] },
        (stats) => stats && { ...stats, awaitingTriage: Math.max(0, stats.awaitingTriage - 1) }
      );
      return { snapshot };
    },
    onError: (_error: Error, _id: unknown, context: { snapshot: [readonly unknown[], unknown][] } | undefined) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
    },
    onSettled: invalidate
  };
}

export function useTicketActions() {
  const onSuccess = useInvalidateTickets();
  const optimistic = useOptimisticTriage();
  const post = (path: string, body?: unknown) => api<{ ticket: Ticket }>(path, { method: 'POST', body });

  return {
    accept: useMutation({
      mutationKey: TRIAGE_MUTATION_KEY,
      mutationFn: ({ id, edits }: { id: string; edits: TicketEdits }) => post(`/tickets/${id}/accept`, edits),
      onMutate: ({ id }) => optimistic.onMutate(id),
      onError: (error, { id }, context) => optimistic.onError(error, id, context),
      onSettled: optimistic.onSettled
    }),
    dismiss: useMutation({
      mutationKey: TRIAGE_MUTATION_KEY,
      mutationFn: (id: string) => post(`/tickets/${id}/dismiss`),
      ...optimistic
    }),
    returnToQueue: useMutation({ mutationFn: (id: string) => post(`/tickets/${id}/return-to-queue`), onSuccess }),
    create: useMutation({ mutationFn: (title: string) => post('/tickets', { title }), onSuccess }),
    update: useMutation({
      mutationFn: ({
        id,
        patch
      }: {
        id: string;
        patch: TicketEdits & { status?: Status; assigneeId?: string | null };
      }) => api<{ ticket: Ticket }>(`/tickets/${id}`, { method: 'PATCH', body: patch }),
      onSuccess
    }),
    remove: useMutation({
      mutationFn: (id: string) => api<void>(`/tickets/${id}`, { method: 'DELETE' }),
      onSuccess
    })
  };
}

/** Add, edit and delete internal notes on one ticket. */
export function useNoteActions(ticketId: string) {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
  const notesUrl = `/tickets/${ticketId}/notes`;

  return {
    add: useMutation({
      mutationFn: (body: string) => api<{ note: Message }>(notesUrl, { method: 'POST', body: { body } }),
      onSuccess
    }),
    edit: useMutation({
      mutationFn: ({ id, body }: { id: string; body: string }) =>
        api<{ note: Message }>(`${notesUrl}/${id}`, { method: 'PATCH', body: { body } }),
      onSuccess
    }),
    remove: useMutation({
      mutationFn: (id: string) => api<void>(`${notesUrl}/${id}`, { method: 'DELETE' }),
      onSuccess
    })
  };
}

export function useSyncInbox() {
  const onSuccess = useInvalidateTickets();
  return useMutation({
    mutationFn: () => api<{ imported: Ticket | null; remaining: number }>('/emails/sync', { method: 'POST' }),
    onSuccess
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<OrgSettings>) =>
      api<{ settings: OrgSettings }>('/org/settings', { method: 'PATCH', body: patch }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['org'] })
  });
}
