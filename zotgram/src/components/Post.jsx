import statusText from "../utils/statusText";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { useState } from "react";
import { api } from "../api/client";
import Comments from "./Comments";
import like from "../assets/images/like.svg";
import likeFilled from "../assets/images/likeIsLiked.svg";
import comments from "../assets/images/comment.svg";
import share from "../assets/images/share.svg";
import getUserColor from "../utils/getUserColor";

function Post({ post, showActivity = true }) {
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [savedPost, setSavedPost] = useState(null);
  const value = savedPost?.source === post ? savedPost.value : post;

  const { user: currentUser } = useSelector((state) => state.user);
  const isLiked = Boolean(value.isLiked);
  const likesCount = value.likesCount || 0;
  const commentsCount = value.commentsCount || 0;

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

  const handleLike = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const updated = await api(`/api/core/posts/${value.id}/like/`, {
        method: isLiked ? "DELETE" : "PUT",
      });
      setSavedPost({ source: post, value: updated });
    } catch (error) {
      setError(statusText(error.message || "Не удалось изменить лайк"));
    } finally {
      setBusy(false);
    }
  };

  const handleAddComment = () => {
    setSavedPost((previous) => {
      const latest = previous?.source === post ? previous.value : post;
      return {
        source: post,
        value: { ...latest, commentsCount: (latest.commentsCount || 0) + 1 },
      };
    });
  };

  const getUserData = (userId) => {
    if (String(userId) === String(currentUser?.id)) return currentUser;
    return post.author;
  };

  const user = getUserData(post.userId);
  const firstName = user?.name || "Пользователь";
  const lastName = user?.lastname || "";

  const handleShare = async () => {
    setCopied(false);
    setError("");

    try {
      const url = new URL(`/posts/${value.id}`, window.location.origin);
      await navigator.clipboard.writeText(url.href);
      setCopied(true);
    } catch {
      setError("Не удалось скопировать ссылку");
    }
  };

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

      {error && (
        <p className="status-message" role="alert">
          {error}
        </p>
      )}

      {showActivity ? (
        <>
          <div className="post__buttons">
            <button
              type="button"
              className="post__buttons-item"
              disabled={busy}
              onClick={handleLike}
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
              disabled={busy}
              onClick={() => setIsCommentsOpen((prev) => !prev)}
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
              disabled={busy}
              onClick={handleShare}
            >
              <img
                src={share}
                alt="Поделиться"
                className="post__buttons-item-image"
              />
              {copied ? "Ссылка скопирована" : "Поделиться"}
            </button>
          </div>
        </>
      ) : (
        <div className="post__buttons">
          <button
            type="button"
            className="post__buttons-item"
            disabled={busy}
            onClick={() => setIsCommentsOpen((prev) => !prev)}
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
      {isCommentsOpen && (
        <Comments postId={post.id} onAdded={handleAddComment} />
      )}
    </div>
  );
}

export default Post;
