import type { ReactNode } from 'react';

/** The parts of a TanStack query result this component reads (plain or infinite). */
interface QueryLike<T> {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  data: T | undefined;
  refetch: () => unknown;
}

interface QueryStateProps<T> {
  query: QueryLike<T>;
  children: (data: T) => ReactNode;
  /** Shown instead of children when this returns true for the loaded data. */
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  loadingLabel?: string;
}

/** Renders the loading, error, empty or loaded state of a query. */
export function QueryState<T>({ query, children, isEmpty, empty, loadingLabel = 'Loading…' }: QueryStateProps<T>) {
  if (query.isPending) {
    return (
      <div className="state-box" role="status">
        {loadingLabel}
      </div>
    );
  }
  if (query.isError || query.data === undefined) {
    return <ErrorState message={query.error?.message ?? ''} onRetry={() => query.refetch()} />;
  }
  if (isEmpty?.(query.data)) {
    return <div className="state-box">{empty}</div>;
  }
  return <>{children(query.data)}</>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-box state-error" role="alert">
      <span>Couldn’t load this. {message}</span>
      {onRetry && (
        <button type="button" className="btn btn-ghost" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
