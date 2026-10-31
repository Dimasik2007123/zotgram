import { createSlice } from "@reduxjs/toolkit";

const outbox = createSlice({
  name: "outbox",
  initialState: { items: [] },
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
    clearOutbox: () => ({ items: [] }),
  },
});

export const { sendingMessage, failedMessage, confirmedMessage, clearOutbox } = outbox.actions;
export default outbox.reducer;
