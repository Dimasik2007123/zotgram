import { Link, NavLink } from "react-router-dom";
import { useSelector } from "react-redux";
import { useQuery } from "../api/hooks";
import { api, allPages } from "../api/client";
import getUserColor from "../utils/getUserColor";

function LeftBar() {
  const user = useSelector((state) => state.user.user);
  const departments = useQuery(
    () => api("/api/core/departments/"),
    "departments",
  );
  const chats = useQuery(
    () => (user?.department ? allPages("/api/chat/chats/") : Promise.resolve([])),
    user?.department || "",
    "chats profiles",
  );
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
        {departments.loading && <p>Загрузка отделов…</p>}
        {departments.error && <p role="alert">{departments.error}</p>}
        {chats.loading && <p>Загрузка чатов отделов…</p>}
        {chats.error && (
          <p role="alert">
            {chats.error}{" "}
            <button type="button" onClick={chats.reload}>Повторить</button>
          </p>
        )}
        <ul className="leftbar-departments__list">
          {departments.data?.map((department) => {
            const isOwnDepartment = department.id === user?.department;
            const chat = chats.data?.find(
              (item) => item.type === "group" && item.departmentId === department.id,
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
                    title={isOwnDepartment ? "Чат отдела пока недоступен" : "Доступно сотрудникам этого отдела"}
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
