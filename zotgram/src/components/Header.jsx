import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import logo from "../assets/images/logo.svg";
import union from "../assets/images/union.svg";
import house from "../assets/images/house.svg";
import message from "../assets/images/message.svg";
import people from "../assets/images/people.svg";
import plus from "../assets/images/plus.svg";
//import { useState } from "react";
import getUserColor from "../utils/getUserColor";

function Header({ onOpenModal }) {
  //const [activePage, setActivePage] = useState(null);
  const { user } = useSelector((state) => state.user);

  return (
    <header className="header">
      <div className="header__left">
        <div className="logo__wrapper">
          <Link to="/">
            <img src={logo} alt="ZotGram Logo" className="logo__image" />
          </Link>
          <div className="logo__text">ZotGram</div>
        </div>

        <div className="search__wrapper">
          <Link to="/" className="search__button">
            <img src={union} alt="Поиск" />
          </Link>
          <input type="text" className="search__input" placeholder="Поиск..." />
        </div>
      </div>

      <nav className="header__menu">
        <Link to="/" className="header__menu-link">
          <img src={house} alt="Посты" className="header__menu-link-image" />
          Посты
        </Link>
        <Link to="/" className="header__menu-link">
          <img
            src={message}
            alt="Сообщения"
            className="header__menu-link-image"
          />
          Сообщения
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
          style={{ background: getUserColor(user?.id || "") }}
        >
          {user?.name?.charAt(0) || "П"}
          {user?.lastname?.charAt(0) || ""}
        </Link>
      </div>
    </header>
  );
}

export default Header;
