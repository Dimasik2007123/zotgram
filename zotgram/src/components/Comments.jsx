import send from "../assets/images/send.svg";
import { useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import getUserColor from "../utils/getUserColor";
import users from "../users";

function Comments({ comments, postId, onAddComment }) {
  const [newComment, setNewComment] = useState("");
  const { user: currentUser } = useSelector((state) => state.user);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (newComment.trim() === "") return;

    //const user = users.find((u) => String(u.id) === String(currentUser.id));

    const comment = {
      id: crypto.randomUUID(),
      userId: currentUser.id || 1,
      text: newComment.trim(),
    };

    onAddComment(postId, comment);
    setNewComment("");
  };

  const getUserData = (userId) => {
    return users.find((u) => String(u.id) === String(userId));
  };

  return (
    <div className="comments">
      <div className="comments__list">
        {comments.length === 0 ? (
          <p className="comments__empty">Нет комментариев</p>
        ) : (
          comments.map((comment) => {
            const isMyComment =
              String(comment.userId) === String(currentUser.id);

            const user = getUserData(comment.userId);

            const firstName = user?.name || "Пользователь";
            const lastName = user?.lastname || "";

            if (!isMyComment) {
              return (
                <div key={comment.id} className="comments__item">
                  <Link
                    to={`/profile/${comment.userId}`}
                    className="comments__avatar"
                    style={{ background: getUserColor(comment.userId) }}
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
                  </div>
                  <Link
                    to={`/profile/${comment.userId}`}
                    className="comments__avatar"
                    style={{ background: getUserColor(comment.userId) }}
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

      <form className="comments__form" onSubmit={handleSubmit}>
        <Link
          to={`/profile/${currentUser.id}`}
          style={{ background: getUserColor(currentUser.id) }}
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
