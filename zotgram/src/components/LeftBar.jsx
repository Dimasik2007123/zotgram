import { Link, NavLink } from "react-router-dom";
import { useSelector } from "react-redux";
import { useChatNavigation, useQuery } from "../api/hooks";
import { api } from "../api/client";
import getUserColor from "../utils/getUserColor";

function LeftBar() {
  const user = useSelector((state) => state.user.user);
  const departments = useQuery(
    () => api("/api/core/departments/"),
    "departments",
  );
  const chats = useChatNavigation();

  const generalChat = chats.systemChats?.find((chat) => chat.systemKey === "general");

  return (
    <div className="leftbar">
      <div className="user-info">
        <Link
          to={`/profile/${user?.id || ""}`}
          className="leftbar__link link-profile link-profile--big"
          style={{ background: getUserColor(user) }}
        >
          {user?.name?.charAt(0) || "П"}
          {user?.lastname?.charAt(0) || ""}
        </Link>
        <div className="user-infotext">
          <div className="user-infoname">
            {user.name ? user.name : "Пользователь"}{" "}
            {user.lastname ? user.lastname : ""}
          </div>
          <div className="user-infodesc">{user ? user.email : ""}</div>
        </div>
      </div>

      <div className="divisor"></div>

      <div className="leftbar-departments">
        <div className="leftbar-departments__title">ОТДЕЛЫ</div>
        {departments.loading && (
          <p className="status-message" role="status">
            Загрузка отделов
          </p>
        )}
        {departments.error && (
          <p className="status-message" role="alert">
            {departments.error}
          </p>
        )}
        {chats.loading && (
          <p className="status-message" role="status">
            Загрузка чатов отделов
          </p>
        )}
        {chats.error && (
          <div className="status-message" role="alert">
            <p className="status-message__text">{chats.error}</p>
            <button
              type="button"
              className="status-message__action"
              onClick={chats.reload}
            >
              Повторить
            </button>
          </div>
        )}
        <ul className="leftbar-departments__list">
          {generalChat && (
            <li className="leftbar-departments__item">
              <NavLink
                to={`/chats/${generalChat.id}`}
                end
                className="leftbar-departments__link"
              >
                Общий чат
              </NavLink>
            </li>
          )}
          {departments.data?.map((department) => {
            const isOwnDepartment = department.id === user?.department;
            const chat = chats.systemChats?.find(
              (item) => item.departmentId === department.id,
            );

            return (
              <li className="leftbar-departments__item" key={department.id}>
                {isOwnDepartment && chat ? (
                  <NavLink
                    to={`/chats/${chat.id}`}
                    end
                    className={({ isActive }) =>
                      `leftbar-departments__link${isActive ? " leftbar-departments__link--active" : ""}`
                    }
                  >
                    {department.name}
                  </NavLink>
                ) : (
                  <span
                    className="leftbar-departments__link leftbar-departments__link--disabled"
                    aria-disabled="true"
                    title={
                      isOwnDepartment
                        ? "Чат отдела пока недоступен"
                        : "Доступно сотрудникам этого отдела"
                    }
                  >
                    {department.name}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default LeftBar;
