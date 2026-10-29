import statusText from "../utils/statusText";
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useDispatch } from "react-redux";
import { login } from "../store/userReducer";
import { authPost, readResponse, setAccess } from "../api/session";

const attempts = new Map();

function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const state = params.get("state");
  const oauthError = params.get("error");
  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState(null);
  const requestError =
    failure?.search === location.search ? failure.message : "";
  const error = starting
    ? ""
    : requestError ||
      (oauthError ? "Вход отменён. Можно попробовать снова" : "");
  const loading = starting || Boolean(code && !oauthError && !requestError);

  useEffect(() => {
    if (oauthError || !code) return;
    let active = true;
    if (!attempts.has(code))
      attempts.set(code, authPost("callback", { code, state }));
    attempts
      .get(code)
      .then((data) => {
        if (!active) return;
        setAccess(data.access);
        dispatch(login(data.user));
        const returnTo = sessionStorage.getItem("zotgram:returnTo") || "/";
        sessionStorage.removeItem("zotgram:returnTo");

        const destination =
          returnTo.startsWith("/") && !returnTo.startsWith("//")
            ? returnTo
            : "/";

        navigate(destination, { replace: true });
      })
      .catch((err) => {
        if (active) {
          setFailure({
            search: location.search,
            message: statusText(err.message),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [code, state, oauthError, location.search, dispatch, navigate]);
  async function begin() {
    setStarting(true);
    setFailure(null);
    try {
      sessionStorage.setItem("zotgram:returnTo", location.state?.from || "/");
      const data = await fetch("/api/core/auth/start/", {
        credentials: "same-origin",
      }).then(readResponse);
      window.location.assign(data.authorize_url);
    } catch (err) {
      setFailure({ search: location.search, message: statusText(err.message) });
      setStarting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>ZotGram</h1>
          <p>Внутренняя соцсеть компании</p>
        </div>

        {error && (
          <div className="status-message" role="alert">
            {error}
          </div>
        )}

        <button onClick={begin} disabled={loading} className="yandex-login-btn">
          <svg
            width="24"
            height="24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M2.04 12c0-5.523 4.476-10 10-10 5.522 0 10 4.477 10 10s-4.478 10-10 10c-5.524 0-10-4.477-10-10z"
              fill="#FC3F1D"
            />
            <path
              d="M13.32 7.666h-.924c-1.694 0-2.585.858-2.585 2.123 0 1.43.616 2.1 1.881 2.959l1.045.704-3.003 4.487H7.49l2.695-4.014c-1.55-1.111-2.42-2.19-2.42-4.015 0-2.288 1.595-3.85 4.62-3.85h3.003v11.868H13.32V7.666z"
              fill="#fff"
            />
          </svg>
          {loading ? "Загрузка" : "Войти через Яндекс"}
        </button>
      </div>
    </div>
  );
}

export default Login;
