import statusText from "../utils/statusText";
import send from "../assets/images/send.svg";
import { useState } from "react";
import { useSelector } from "react-redux";
import { serverApi } from "../api/serverApi";
import { useComments } from "../api/hooks";
import LoadMore from "./LoadMore";
import { Link } from "react-router-dom";
import getUserColor from "../utils/getUserColor";

function Comments({ postId, onAdded }) {
  const [newComment, setNewComment] = useState("");
  const { user: currentUser } = useSelector((state) => state.user);
  const commentsState = useComments(postId);
  const [addComment] = serverApi.useAddCommentMutation();
  const comments = commentsState.data || [];
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy || newComment.trim() === "") return;


    setBusy(true);
    setSendError("");

    try {
      await addComment({ postId, text: newComment.trim() }).unwrap();
      setNewComment("");
      onAdded?.();
    } catch (error) {
      setSendError(statusText(error.message || "Не удалось отправить комментарий"));
    } finally {
      setBusy(false);
    }
  };

  const getUserData = (userId) => {
    if (String(userId) === String(currentUser?.id)) return currentUser;
    return comments.find((comment) => String(comment.userId) === String(userId))
      ?.author;
  };

  return (
    <div className="comments">
      <div className="comments__list">
        <LoadMore state={commentsState} label="Показать более ранние комментарии" />
        {commentsState.loading && (
          <p className="status-message" role="status">
            Загрузка комментариев
          </p>
        )}
        {commentsState.error && (
          <div className="status-message" role="alert">
            <p className="status-message__text">{commentsState.error}</p>
            <button
              type="button"
              className="status-message__action"
              onClick={commentsState.reload}
            >
              Повторить
            </button>
          </div>
        )}
        {!comments.length && !commentsState.loading && !commentsState.error ? (
          <p className="status-message">Нет комментариев</p>
        ) : (
          comments.map((comment) => {
            const isMyComment =
              String(comment.userId) === String(currentUser.id);

            const user = getUserData(comment.userId);

            const firstName = user?.name || "Пользователь";
            const lastName = user?.lastname || "";
            const date = new Date(comment.date);

            if (!isMyComment) {
              return (
                <div key={comment.id} className="comments__item">
                  <Link
                    to={`/profile/${comment.userId}`}
                    className="comments__avatar"
                    style={{
                      background: getUserColor(
                        isMyComment ? currentUser : user,
                      ),
                    }}
                  >
                    {firstName && lastName
                      ? firstName.charAt(0) + lastName.charAt(0)
                      : "П"}
                  </Link>
                  <div className="comments__body">
                    <div className="comments__name">
                      {firstName || "Пользователь"} {lastName || ""}
                    </div>
                    <div className="comments__text">{comment.text}</div>
                    <div className="chat__message-time">
                      {date.toLocaleDateString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              );
            } else {
              return (
                <div key={comment.id} className="comments__item--my">
                  <div className="comments__body--my">
                    <div className="comments__name">
                      {firstName || "Пользователь"} {lastName || ""}
                    </div>
                    <div className="comments__text">{comment.text}</div>

                    <div className="chat__message-time">
                      {date.toLocaleDateString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <Link
                    to={`/profile/${comment.userId}`}
                    className="comments__avatar"
                    style={{
                      background: getUserColor(
                        isMyComment ? currentUser : user,
                      ),
                    }}
                  >
                    {firstName && lastName
                      ? firstName.charAt(0) + lastName.charAt(0)
                      : "П"}
                  </Link>
                </div>
              );
            }
          })
        )}
      </div>

      {sendError && (
        <p className="status-message" role="alert">
          {sendError}
        </p>
      )}
      <form className="comments__form" onSubmit={handleSubmit}>
        <Link
          to={`/profile/${currentUser.id}`}
          style={{ background: getUserColor(currentUser) }}
          className="comments__avatar"
        >
          {currentUser.name
            ? currentUser.name.charAt(0) +
              (currentUser.lastname?.charAt(0) || "")
            : "П"}
        </Link>
        <input
          type="text"
          className="comments__input"
          placeholder="Текст комментария..."
          disabled={busy}
          maxLength={3000}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
        />
        <button type="submit" className="comments__send">
          <img src={send} alt="Отправить" />
        </button>
      </form>
    </div>
  );
}

export default Comments;
