import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import like from "../assets/images/like.svg";
import likeFilled from "../assets/images/likeIsLiked.svg";
import comments from "../assets/images/comment.svg";
import share from "../assets/images/share.svg";
import getUserColor from "../utils/getUserColor";

function Post({ post, showActivity = true }) {
  const isCommentsOpen = false;

  const { user: currentUser } = useSelector((state) => state.user);
  const isLiked = false;
  const likesCount = null;
  const commentsCount = null;

  const formatDate = (dateString) => {
    const date = new Date(dateString);

    if (isNaN(date.getTime())) return "Неизвестная дата";

    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return "Только что";
    }

    if (diffMins < 60) {
      return `${diffMins} минут${getMinuteEnding(diffMins)} назад`;
    }

    if (diffHours < 24) {
      return `${diffHours} час${getHourEnding(diffHours)} назад`;
    }

    if (diffDays === 1) {
      return `${diffDays} день назад`;
    } else if (diffDays < 7) {
      return `${diffDays} дн${getDayEnding(diffDays)} назад`;
    }

    const options = {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };
    return date.toLocaleDateString("ru-RU", options);
  };

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

  const getLikesText = (count) => {
    if (count === 0) return "Нет лайков";

    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;

    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
      return `${count} лайков`;
    }

    if (lastDigit === 1) {
      return `${count} лайк`;
    }

    if (lastDigit >= 2 && lastDigit <= 4) {
      return `${count} лайка`;
    }

    return `${count} лайков`;
  };

  const getCommentsText = (count) => {
    if (count === 0) return "Нет комментариев";

    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;

    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
      return `${count} комментариев`;
    }

    if (lastDigit === 1) {
      return `${count} комментарий`;
    }

    if (lastDigit >= 2 && lastDigit <= 4) {
      return `${count} комментария`;
    }

    return `${count} комментариев`;
  };

  const getUserData = (userId) => {
    if (String(userId) === String(currentUser?.id)) return currentUser;
    return post.author;
  };

  const user = getUserData(post.userId);
  const firstName = user?.name || "Пользователь";
  const lastName = user?.lastname || "";

  return (
    <div
      className="post"
      style={{ paddingBottom: isCommentsOpen ? 0 : undefined }}
    >
      <div className="post__author">
        <div className="post__user-info">
          <Link
            to={`/profile/${post.userId}`}
            className="leftbar__link link-profile link-profile--big"
            style={{
              background: getUserColor(
                String(post.userId) === String(currentUser?.id)
                  ? currentUser
                  : user,
              ),
            }}
          >
            {firstName && lastName
              ? firstName.charAt(0) + lastName.charAt(0)
              : "П"}
          </Link>
          <div className="post__user-infotext">
            <div className="post__user-infoname">
              {firstName || "Пользователь"} {lastName || ""}
            </div>
            <div className="post__user-infodate">{formatDate(post.date)}</div>
          </div>
        </div>
      </div>

      <div className="post__content">
        {post.text && <div className="post__content-text">{post.text}</div>}

        {post.image && (
          <div className="post__content-image-block">
            <img src={post.image} alt="Пост" className="post__content-image" />
          </div>
        )}
      </div>

      <div className="post__stats">
        <div className="post__stats-likes">
          {likesCount === null ? "Лайки: —" : getLikesText(likesCount)}
        </div>
        <div className="post__stats-comments">
          {commentsCount === null
            ? "Комментарии: —"
            : getCommentsText(commentsCount)}
        </div>
      </div>

      <div className="divisor"></div>

      {showActivity ? (
        <>
          <div className="post__buttons">
            <button
              type="button"
              className="post__buttons-item"
              disabled
              title="Лайки пока недоступны"
            >
              <img
                src={isLiked ? likeFilled : like}
                alt="Лайк"
                className="post__buttons-item-image"
              />
              Лайк
            </button>
            <button
              type="button"
              className="post__buttons-item"
              disabled
              title="Комментарии пока недоступны"
            >
              <img
                src={comments}
                alt="Комментарии"
                className="post__buttons-item-image"
              />
              Комментарии
            </button>
            <button
              type="button"
              className="post__buttons-item"
              disabled
              title="Поделиться пока недоступно"
            >
              <img
                src={share}
                alt="Поделиться"
                className="post__buttons-item-image"
              />
              Поделиться
            </button>
          </div>
        </>
      ) : (
        <div className="post__buttons">
          <button
            type="button"
            className="post__buttons-item"
            disabled
            title="Комментарии пока недоступны"
          >
            <img
              src={comments}
              alt="Комментарии"
              className="post__buttons-item-image"
            />
            Комментарии
          </button>
        </div>
      )}
    </div>
  );
}

export default Post;
