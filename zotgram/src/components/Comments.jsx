import send from "../assets/images/send.svg";
import { useState } from "react";
import { Link } from "react-router-dom";

function Comments({ comments, postId, onAddComment }) {
  const [newComment, setNewComment] = useState("");
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (newComment.trim() === "") return;

    const comment = {
      id: crypto.randomUUID(),
      userId: currentUser.id || 1,
      firstName: currentUser.name || "Пользователь",
      lastName: currentUser.lastname || "",
      text: newComment.trim(),
    };

    onAddComment(postId, comment);
    setNewComment("");
  };

  return (
    <div className="comments">
      <div className="comments__list">
        {comments.length === 0 ? (
          <p className="comments__empty">Нет комментариев</p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="comments__item">
              <Link to="/" className="comments__avatar">
                {comment.firstName && comment.lastName
                  ? comment.firstName.charAt(0) + comment.lastName.charAt(0)
                  : "П"}
              </Link>
              <div className="comments__body">
                <div className="comments__name">
                  {comment.firstName || "Пользователь"} {comment.lastName || ""}
                </div>
                <div className="comments__text">{comment.text}</div>
              </div>
            </div>
          ))
        )}
      </div>

      <form className="comments__form" onSubmit={handleSubmit}>
        <Link to="/" className="comments__avatar">
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
