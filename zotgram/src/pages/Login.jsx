import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleYandexCallback = async (code) => {
    setLoading(true);
    setError("");

    try {
      const tokenResponse = await fetch("https://oauth.yandex.ru/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code,
          client_id: import.meta.env.VITE_YANDEX_CLIENT_ID,
          client_secret: import.meta.env.VITE_YANDEX_CLIENT_SECRET || "",
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        throw new Error(
          errorData.error_description || "Не удалось получить токен",
        );
      }

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      const userResponse = await fetch(
        "https://login.yandex.ru/info?format=json",
        {
          headers: {
            Authorization: `OAuth ${accessToken}`,
          },
        },
      );

      if (!userResponse.ok) {
        throw new Error("Не удалось получить данные пользователя");
      }

      const yandexUser = await userResponse.json();

      const userData = {
        id: yandexUser.id,
        name:
          yandexUser.first_name || yandexUser.display_name || "Пользователь",
        lastname: yandexUser.last_name || "",
        email: yandexUser.default_email || "",
        avatar: yandexUser.default_avatar_id || "",
        login: yandexUser.login || "",
      };

      localStorage.setItem("user", JSON.stringify(userData));
      localStorage.setItem("yandex_token", accessToken);

      navigate("/", { state: { user: userData } });
    } catch (error) {
      console.error("Ошибка авторизации через Яндекс:", error);
      setError(error.message || "Не удалось выполнить вход через Яндекс");
      setLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");

    if (code) {
      const timeoutId = setTimeout(() => {
        handleYandexCallback(code);
      }, 0);

      return () => clearTimeout(timeoutId);
    }
  }, [location]);

  const handleYandexLogin = () => {
    setLoading(true);
    setError("");

    const clientId = import.meta.env.VITE_YANDEX_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_YANDEX_REDIRECT_URI;

    if (!clientId || clientId === "ваш_client_id_из_яндекса") {
      setError("Client ID не настроен. Проверьте файл .env");
      setLoading(false);
      return;
    }

    const yandexAuthUrl =
      `https://oauth.yandex.ru/authorize?` +
      `response_type=code&` +
      `client_id=${clientId}&` +
      `redirect_uri=${redirectUri}&` +
      `force_confirm=false`;

    window.location.href = yandexAuthUrl;
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>ZotGram</h1>
          <p>Внутренняя соцсеть компании</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <button
          onClick={handleYandexLogin}
          disabled={loading}
          className="yandex-login-btn"
        >
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
          {loading ? "Загрузка..." : "Войти через Яндекс"}
        </button>
      </div>
    </div>
  );
}

export default Login;
