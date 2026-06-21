import { Link } from "react-router-dom";
import logo from "../assets/images/logo.svg";
import union from "../assets/images/union.svg";
import house from "../assets/images/house.svg";
import message from "../assets/images/message.svg";
import people from "../assets/images/people.svg";
import plus from "../assets/images/plus.svg";
//import { useState } from "react";

function Header() {
  //const [activePage, setActivePage] = useState(null);

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
          <button className="search__button">
            <img src={union} alt="Поиск" />
          </button>
          <input type="text" className="search__input" placeholder="Поиск..." />
        </div>
      </div>

      <nav className="header__menu">
        <button
          className="header__menu-link"
          style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
        >
          <img src={house} alt="Посты" className="header__menu-link-image" />
          Посты
        </button>
        <button className="header__menu-link">
          <img
            src={message}
            alt="Сообщения"
            className="header__menu-link-image"
          />
          Сообщения
        </button>
        <button className="header__menu-link">
          <img src={people} alt="Друзья" className="header__menu-link-image" />
          Друзья
        </button>
      </nav>

      <div className="header__right">
        <button className="header__right-link">
          <img src={plus} alt="Создать пост" />
          Пост
        </button>
        <button className="header__right-link header__right-link--profile">
          ЗЗ
        </button>
      </div>
    </header>
  );
}

export default Header;
