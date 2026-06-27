import { Link } from "react-router-dom";

function Post({ post }) {
  //const user = localStorage.getItem("user");
  const formatDate = (dateString) => {
    const date = new Date(dateString);

    // Проверка на валидность
    if (isNaN(date.getTime())) return "Неизвестная дата";

    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    // Если прошло меньше 1 минуты
    if (diffMins < 1) {
      return "Только что";
    }

    // Если прошло меньше 1 часа
    if (diffMins < 60) {
      return `${diffMins} минут${getMinuteEnding(diffMins)} назад`;
    }

    // Если прошло меньше 24 часов
    if (diffHours < 24) {
      return `${diffHours} час${getHourEnding(diffHours)} назад`;
    }

    // Если прошло меньше 7 дней
    if (diffDays === 1) {
      return `${diffDays} день назад`;
    } else if (diffDays < 7) {
      return `${diffDays} дн${getDayEnding(diffDays)} назад`;
    }

    // Если прошло больше недели — показываем полную дату
    const options = {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };
    return date.toLocaleDateString("ru-RU", options);
  };

  // Вспомогательные функции для окончаний
  const getMinuteEnding = (n) => {
    if (n % 10 === 1 && n % 100 !== 11) return "у";
    if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100))
      return "ы";
    return "";
  };

  const getHourEnding = (n) => {
    if (n % 10 === 1 && n % 100 !== 11) return "";
    if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100))
      return "а";
    return "ов";
  };

  const getDayEnding = (n) => {
    if (n % 10 === 1 && n % 100 !== 11) return "ь";
    if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100))
      return "я";
    return "ей";
  };

  return (
    <div className="post">
      <div className="post__author">
        <div className="post__user-info">
          <Link to="/" className="leftbar__link link-profile link-profile--big">
            {post.firstname && post.lastname
              ? post.firstname.charAt(0) + post.lastname.charAt(0)
              : "П"}
          </Link>
          <div className="post__user-infotext">
            <div className="post__user-infoname">
              {post.firstname || "Пользователь"} {post.lastname || ""}
            </div>
            <div className="post__user-infodate">{formatDate(post.date)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Post;
