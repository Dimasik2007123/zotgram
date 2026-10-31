import { createSlice } from "@reduxjs/toolkit";

const outbox = createSlice({
  name: "outbox",
  initialState: { items: [], comments: [] },
  reducers: {
    sendingMessage(state, { payload }) {
      const existing = state.items.find((item) => item.attempt_id === payload.attempt_id);
      if (existing) {
        existing.delivery = "sending";
        existing.deliveryError = "";
      } else state.items.push({ ...payload, delivery: "sending" });
    },
    failedMessage(state, { payload }) {
      const item = state.items.find((entry) => entry.attempt_id === payload.attemptId);
      if (item) {
        item.delivery = "failed";
        item.deliveryError = payload.message;
      }
    },
    confirmedMessage(state, { payload }) {
      state.items = state.items.filter((item) => item.attempt_id !== payload);
    },
    sendingComment(state, { payload }) {
      const existing = state.comments.find((item) => item.attempt_id === payload.attempt_id);
      if (existing) {
        existing.delivery = "sending";
        existing.deliveryError = "";
      } else state.comments.push({ ...payload, delivery: "sending" });
    },
    failedComment(state, { payload }) {
      const item = state.comments.find((entry) => entry.attempt_id === payload.attemptId);
      if (item) {
        item.delivery = "failed";
        item.deliveryError = payload.message;
      }
    },
    confirmedComment(state, { payload }) {
      state.comments = state.comments.filter((item) => item.attempt_id !== payload);
    },
    discardComment(state, { payload }) {
      state.comments = state.comments.filter((item) => item.attempt_id !== payload || item.delivery !== "failed");
    },
    clearOutbox: () => ({ items: [], comments: [] }),
  },
});

export const { sendingMessage, failedMessage, confirmedMessage, clearOutbox,
  sendingComment, failedComment, confirmedComment, discardComment } = outbox.actions;
export default outbox.reducer;
