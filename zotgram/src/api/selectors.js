import { createSelector } from "@reduxjs/toolkit";
import { shallowEqual } from "react-redux";

const denied = (error) => [401, 403, 404].includes(error?.status);

export function peopleSelector(ids, endpoint) {
  const queries = ids.map((id) => endpoint.select(id));
  const data = createSelector(
    queries.length ? queries.map((select) => (state) => {
      const result = select(state);
      return denied(result.error) ? undefined : result.data;
    }) : [() => undefined],
    (...people) => people.filter(Boolean),
  );
  const loading = createSelector(
    queries.length ? queries.map((select) => (state) => {
      const result = select(state);
      return !result.data && !result.isError;
    }) : [() => false],
    (...pending) => pending.some(Boolean),
  );
  const error = createSelector(
    queries.length ? queries.map((select) => (state) => select(state).error?.message || "") : [() => ""],
    (...errors) => errors.find((error) => typeof error === "string" && error.length > 0) || "",
  );
  return createSelector([data, loading, error], (data, loading, error) => ({ data, loading, error }));
}

export const outboxSelector = (kind, field, id) => createSelector(
  [(state) => state.outbox[kind]],
  (items) => items.filter((item) => item[field] === id),
  { memoizeOptions: { resultEqualityCheck: shallowEqual } },
);

export const selectChatNavigation = createSelector(
  [(state) => state.chats.systemChats, (state) => state.chats.items === null && (state.chats.loading || !state.chats.error),
    (state) => state.chats.error],
  (systemChats, loading, error) => ({ systemChats, loading, error }),
);

export const selectCachedQuery = (state) => ({ currentData: state.currentData,
  isLoading: state.isLoading || (state.isUninitialized && !state.currentData), error: state.error });
