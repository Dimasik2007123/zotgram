import { configureStore } from "@reduxjs/toolkit";
import userReducer from "./userReducer";
import chatsReducer from "./chatsReducer";
import { serverApi } from "../api/serverApi";
import { clearPrivateFiles } from "../api/privateFiles";
import outboxReducer, { clearOutbox } from "./outboxReducer";
import { clearOutboxFiles } from "../api/outboxFiles";
import { resetCacheSession } from "../api/cacheSession";

const resetAccountCache = ({ dispatch, getState }) => (next) => (action) => {
  const owner = getState().user.user?.id;
  const result = next(action);
  if (action.type === "user/logout" ||
      (action.type === "user/login" && owner !== getState().user.user?.id)) {
    resetCacheSession();
    dispatch(serverApi.util.getRunningQueriesThunk()).forEach((request) => request.abort());
    dispatch(serverApi.util.getRunningMutationsThunk()).forEach((request) => request.abort());
    dispatch(serverApi.util.resetApiState());
    clearPrivateFiles();
    dispatch(clearOutbox());
    clearOutboxFiles();
  }
  return result;
};

export const store = configureStore({
  reducer: {
    user: userReducer,
    chats: chatsReducer,
    outbox: outboxReducer,
    [serverApi.reducerPath]: serverApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(resetAccountCache, serverApi.middleware),
});

export default store;
