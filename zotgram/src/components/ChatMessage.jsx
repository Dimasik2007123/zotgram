import { memo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { retryMessage } from "../api/serverApi";
import { usePrivateFile } from "../api/hooks";
import { downloadPrivateFile } from "../api/privateFiles";
import getUserColor from "../utils/getUserColor";
import attach from "../assets/images/file.svg";
import readed from "../assets/images/readed.svg";

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
});

const Attachment = memo(function Attachment({ file, onImageLoad }) {
  const isImage = file?.mime?.startsWith("image/");
  const remote = usePrivateFile(isImage && !file.localUrl ? file.url : "");
  const downloading = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  if (!file) return null;
  const url = file.localUrl || remote;
  const handleDownload = async (event) => {
    if (url) return;
    event.preventDefault();
    if (downloading.current) return;
    downloading.current = true;
    setLoading(true);
    setError("");
    try {
      await downloadPrivateFile(file.url, file.name);
    } catch {
      setError("Не удалось скачать файл. Нажмите на название, чтобы повторить.");
    } finally {
      downloading.current = false;
      setLoading(false);
    }
  };
  return <>
    {isImage && url && <img src={url} alt={file.name} className="chat__message-image"
      onLoad={onImageLoad} onError={onImageLoad} />}
    <div className="chat__message-file">
      <img src={attach} alt="" />
      <a href={url || file.url} download={file.name} onClick={handleDownload} aria-busy={loading || undefined}>{file.name}</a>
      {loading && <span className="status-message status-message--inline" role="status">Скачивание…</span>}
    </div>
    {error && <div className="chat__delivery-error" role="alert">{error}</div>}
  </>;
});

function ChatMessage({ message, author, own, read, onImageLoad }) {
  const dispatch = useDispatch();
  const name = author?.name || "Пользователь";
  return (
    <div className={`chat__message ${own ? "chat__message--own" : ""}`}>
      {!own && <div className="chat__message-avatar" style={{ background: getUserColor(author) }}>
        {name.charAt(0)}{author?.lastname?.charAt(0) || ""}
      </div>}
      <div className="chat__message-content">
        {!own && <div className="chat__message-author">{name}</div>}
        <div className="chat__message-bubble">
          {message.content && <div className="chat__message-text">{message.content}</div>}
          <Attachment file={message.attachment} onImageLoad={onImageLoad} />
          <div className="chat__message-time">
            {dateFormat.format(new Date(message.createdAt))}
            {message.delivery === "failed" && <span className="chat__delivery" role="status">
              Не отправлено
            </span>}
            {own && !message.delivery && <span className="chat__message-status"
              aria-label={read ? "Прочитано" : "Сообщение сохранено"} title={read ? "Прочитано" : "Сообщение сохранено"}>
              <img src={readed} alt="" />{read && <img src={readed} alt="" />}
            </span>}
          </div>
          {message.delivery === "failed" && <div className="chat__delivery-error" role="alert">
            <span>{message.deliveryError}</span>
            <button type="button" onClick={() => dispatch(retryMessage(message.attempt_id))}>Повторить</button>
          </div>}
        </div>
      </div>
    </div>
  );
}

export default memo(ChatMessage);
