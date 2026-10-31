import { memo } from "react";
import { useDispatch } from "react-redux";
import { retryMessage } from "../api/serverApi";
import { usePrivateFile } from "../api/hooks";
import getUserColor from "../utils/getUserColor";
import attach from "../assets/images/file.svg";
import readed from "../assets/images/readed.svg";

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
});

const Attachment = memo(function Attachment({ file, onImageLoad }) {
  const remote = usePrivateFile(file?.url || "");
  if (!file) return null;
  const url = file.localUrl || remote;
  return <>
    {file.mime?.startsWith("image/") && url && <img src={url} alt={file.name} className="chat__message-image"
      onLoad={onImageLoad} onError={onImageLoad} />}
    <div className="chat__message-file">
      <img src={attach} alt="" />
      {url ? <a href={url} download={file.name}>{file.name}</a>
        : <span className="status-message status-message--inline" role="status">Загрузка файла</span>}
    </div>
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
            {message.delivery && <span className="chat__delivery" role="status">
              {message.delivery === "sending" ? "Отправляется" : "Не отправлено"}
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
