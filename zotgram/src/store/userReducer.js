import { createSlice } from "@reduxjs/toolkit";
import users from "../users";

const initialState = {
  user: (() => {
    try {
      const data = localStorage.getItem("user");
      if (!data) return null;
      const parsed = JSON.parse(data);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : null;
    } catch {
      return null;
    }
  })(),
  isAuthenticated: !!localStorage.getItem("user"),
  loading: false,
  error: null,
};

const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    login: (state, action) => {
      const payloadUser = action.payload;
      const existingUser = users.find(
        (u) => String(u.id) === String(payloadUser.id),
      );
      const userData = existingUser || payloadUser;

      state.user = userData;
      state.isAuthenticated = true;
      state.error = null;
      localStorage.setItem("user", JSON.stringify(userData));
    },
    logout: (state) => {
      state.user = null;
      state.isAuthenticated = false;
      state.error = null;
      localStorage.removeItem("user");
      localStorage.removeItem("yandex_token");
    },
    setError: (state, action) => {
      state.error = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    updateUser: (state, action) => {
      state.user = { ...state.user, ...action.payload };
      localStorage.setItem("user", JSON.stringify(state.user));
    },
  },
});

export const { login, logout, setError, clearError, updateUser } =
  userSlice.actions;
export default userSlice.reducer;
