import { configureStore } from "@reduxjs/toolkit";
import userReducer from "./userReducer";
import chatsReducer from "./chatsReducer";

export const store = configureStore({
  reducer: {
    user: userReducer,
    chats: chatsReducer,
  },
});

export default store;
