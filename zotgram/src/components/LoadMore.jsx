function LoadMore({ state, label = "Загрузить ещё" }) {
  if (!state.hasMore && !state.moreError) return null;
  return (
    <div className="status-message pagination-control">
      {state.moreError && <p className="status-message__text" role="alert">{state.moreError}</p>}
      <button type="button" className="status-message__action" disabled={state.loadingMore}
        onClick={state.moreError ? (state.retryMore || state.loadMore) : state.loadMore}>
        {state.loadingMore ? "Загрузка…" : state.moreError ? "Повторить" : label}
      </button>
    </div>
  );
}

export default LoadMore;
