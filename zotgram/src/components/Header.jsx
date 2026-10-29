import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { useChats } from "../api/hooks";
import logo from "../assets/images/logo.svg";
import union from "../assets/images/union.svg";
import house from "../assets/images/house.svg";
import message from "../assets/images/message.svg";
import people from "../assets/images/people.svg";
import plus from "../assets/images/plus.svg";
import getUserColor from "../utils/getUserColor";

function Header({ onOpenModal }) {
  const { user } = useSelector((state) => state.user);
  const location = useLocation();
  const chats = useChats();
  const [params, setParams] = useSearchParams();
  const currentQuery = params.get("q") || "";
  const canSearch =
    ["/", "/people", "/chats"].includes(location.pathname) ||
    location.pathname.startsWith("/chats/");

  const searchPlaceholder =
    location.pathname === "/"
      ? "Поиск постов..."
      : location.pathname === "/people"
        ? "Поиск сотрудников..."
        : location.pathname === "/chats"
          ? "Поиск чатов..."
          : "Поиск в переписке...";

  const handleSearch = (event) => {
    event.preventDefault();
    const query = String(
      new FormData(event.currentTarget).get("q") || "",
    ).trim();
    const next = new URLSearchParams(params);
    if (query) next.set("q", query);
    else next.delete("q");
    next.delete("page");
    setParams(next);
  };

  const unreadCounts = (chats.data || []).reduce(
    (sum, chat) => sum + (chat.unreadCount || 0),
    0,
  );

  return (
    <header className="header">
      <div className="header__left">
        <div className="logo__wrapper">
          <Link to="/">
            <img src={logo} alt="ZotGram Logo" className="logo__image" />
          </Link>
          <div className="logo__text">ZotGram</div>
        </div>

        {canSearch && (
          <form className="search__wrapper" onSubmit={handleSearch}>
            <button type="submit" className="search__button" aria-label="Найти">
              <img src={union} alt="Поиск" />
            </button>
            <input
              key={`${location.pathname}:${currentQuery}`}
              type="search"
              name="q"
              className="search__input"
              placeholder={searchPlaceholder}
              defaultValue={currentQuery}
              maxLength={100}
            />
          </form>
        )}
      </div>

      <nav className="header__menu">
        <Link to="/" className="header__menu-link">
          <img src={house} alt="Посты" className="header__menu-link-image" />
          Посты
        </Link>
        <Link to="/chats" className="header__menu-link">
          <img
            src={message}
            alt="Сообщения"
            className="header__menu-link-image"
          />
          Сообщения{" "}
          {unreadCounts > 0 && (
            <span className="header__menu-link-unread-count">
              {unreadCounts}
            </span>
          )}
        </Link>
        <Link to="/people" className="header__menu-link">
          <img
            src={people}
            alt="Сотрудники"
            className="header__menu-link-image"
          />
          Сотрудники
        </Link>
      </nav>

      <div className="header__right">
        <button className="header__right-link" onClick={onOpenModal}>
          <img src={plus} alt="Создать пост" />
          Пост
        </button>
        <Link
          to={`/profile/${user?.id || ""}`}
          className="header__right-link link-profile"
          style={{ background: getUserColor(user) }}
        >
          <span className="header__profile-initials">
            {user?.name?.charAt(0) || "П"}
            {user?.lastname?.charAt(0) || ""}
          </span>
        </Link>
      </div>
    </header>
  );
}

export default Header;
