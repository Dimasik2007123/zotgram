import { store } from "../store";
import { login, logout } from "../store/userReducer";
import { api } from "./client";
import { onSessionEnd, refreshAccess } from "./session";

onSessionEnd(() => store.dispatch(logout()));
export async function bootstrap() {
  // OAuth callback сначала завершает обмен code. Refresh здесь ему мешал бы.
  if (location.pathname === "/auth/callback") {
    store.dispatch(logout());
    return;
  }
  try {
    await refreshAccess();
    store.dispatch(login(await api("/api/core/me/")));
  } catch {
    store.dispatch(logout());
  }
}
