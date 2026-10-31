import { memo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { useComments } from "../api/hooks";
import { submitComment, retryComment } from "../api/serverApi";
import { discardComment } from "../store/outboxReducer";
import getUserColor from "../utils/getUserColor";
import LoadMore from "./LoadMore";
import send from "../assets/images/send.svg";

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
});

const CommentRow = memo(function CommentRow({ comment, author, own }) {
  const dispatch = useDispatch();
  const name = author?.name || "Пользователь";
  const lastname = author?.lastname || "";
  const avatar = (
    <Link to={`/profile/${comment.userId}`} className="comments__avatar" style={{ background: getUserColor(author) }}>
      {name.charAt(0) + (lastname.charAt(0) || "")}
    </Link>
  );
  return (
    <div className={own ? "comments__item--my" : "comments__item"}>
      {!own && avatar}
      <div className={own ? "comments__body--my" : "comments__body"}>
        <div className="comments__name">{name} {lastname}</div>
        <div className="comments__text">{comment.text}</div>
        <div className="chat__message-time">
          {dateFormat.format(new Date(comment.date))}
          {comment.delivery && <span className="comments__delivery" role="status">
            {comment.delivery === "sending" ? "Отправляется" : "Не отправлено"}
          </span>}
        </div>
        {comment.delivery === "failed" && <div className="chat__delivery-error" role="alert">
          <span>{comment.deliveryError}</span>
          <button type="button" onClick={() => dispatch(retryComment(comment.attempt_id))}>Повторить</button>
          <button type="button" onClick={() => dispatch(discardComment(comment.attempt_id))}>Убрать</button>
        </div>}
      </div>
      {own && avatar}
    </div>
  );
});

const CommentComposer = memo(function CommentComposer({ postId, user }) {
  const dispatch = useDispatch();
  const [text, setText] = useState("");
  const submitting = useRef(false);
  const handleSubmit = (event) => {
    event.preventDefault();
    if (submitting.current || !text.trim()) return;
    submitting.current = true;
    void dispatch(submitComment({ postId, text: text.trim() }));
    setText("");
    queueMicrotask(() => { submitting.current = false; });
  };
  return (
    <form className="comments__form" onSubmit={handleSubmit}>
      <Link to={`/profile/${user.id}`} style={{ background: getUserColor(user) }} className="comments__avatar">
        {(user.name?.charAt(0) || "П") + (user.lastname?.charAt(0) || "")}
      </Link>
      <input type="text" className="comments__input" placeholder="Текст комментария..." maxLength={3000}
        value={text} onChange={(event) => setText(event.target.value)} />
      <button type="submit" className="comments__send" disabled={!text.trim()}>
        <img src={send} alt="Отправить" />
      </button>
    </form>
  );
});

function Comments({ postId }) {
  const user = useSelector((state) => state.user.user);
  const comments = useComments(postId);
  if (!user) return null;
  return (
    <div className="comments">
      <div className="comments__list">
        <LoadMore state={comments} label="Показать более ранние комментарии" />
        {comments.loading && <p className="status-message" role="status">Загрузка комментариев</p>}
        {comments.error && <div className="status-message" role="alert">
          <p className="status-message__text">{comments.error}</p>
          <button type="button" className="status-message__action" onClick={comments.reload}>Повторить</button>
        </div>}
        {!comments.data.length && !comments.loading && !comments.error && <p className="status-message">Нет комментариев</p>}
        {comments.data.map((comment) => {
          const own = String(comment.userId) === String(user.id);
          return <CommentRow key={comment.attempt_id ? `${comment.userId}:${comment.attempt_id}` : comment.id}
            comment={comment} own={own} author={own ? user : comment.author} />;
        })}
      </div>
      <CommentComposer postId={postId} user={user} />
    </div>
  );
}

export default memo(Comments);
