import { Link } from "react-router";
import getUserColor from "../utils/getUserColor";

function LeftBar() {
  const user = localStorage.getItem("user");
  return (
    <div className="leftbar">
      <div className="user-info">
        <Link
          to={`/profile/${user ? JSON.parse(user).id : ""}`}
          className="leftbar__link link-profile link-profile--big"
          style={{ background: getUserColor(user ? JSON.parse(user).id : "") }}
        >
          {user
            ? JSON.parse(user).name.charAt(0) +
              JSON.parse(user).lastname.charAt(0)
            : "П"}
        </Link>
        <div className="user-infotext">
          <div className="user-infoname">
            {user ? JSON.parse(user).name : "Пользователь"}{" "}
            {user ? JSON.parse(user).lastname : ""}
          </div>
          <div className="user-infodesc">
            {user ? JSON.parse(user).email : ""}
          </div>
        </div>
      </div>

      <div className="divisor"></div>

      <div className="leftbar-departments">
        <div className="leftbar-departments__title">ОТДЕЛЫ</div>
        <ul className="leftbar-departments__list">
          <li className="leftbar-departments__item">
            <Link to="/" className="leftbar-departments__link">
              Дизайн
            </Link>
          </li>
          <li className="leftbar-departments__item">
            <Link to="/" className="leftbar-departments__link">
              Бэкенд
            </Link>
          </li>
          <li className="leftbar-departments__item">
            <Link to="/" className="leftbar-departments__link">
              Фронтенд
            </Link>
          </li>
          <li className="leftbar-departments__item">
            <Link to="/" className="leftbar-departments__link">
              Менеджмент
            </Link>
          </li>
          <li className="leftbar-departments__item">
            <Link to="/" className="leftbar-departments__link">
              Тестирование
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}

export default LeftBar;
