import statusText from "../utils/statusText";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, changed } from "../api/client";
import { useMessages, usePeople, usePrivateFile, useQuery } from "../api/hooks";
import getUserColor from "../utils/getUserColor.js";
import GroupInfoModal from "./GroupInfoModal.jsx";
import info from "../assets/images/info.svg";
import attach from "../assets/images/file.svg";
import send from "../assets/images/send.svg";
import back from "../assets/images/back.svg";
import readed from "../assets/images/readed.svg";

const attachmentsEnabled = true;
const groupsEnabled = true;

function Attachment({ file, onImageLoad }) {
  const url = usePrivateFile(file?.url || "");
  if (!file) return null;
  const isImage = file.mime?.startsWith("image/");
  return (
    <>
      {isImage && url && (
        <img
          src={url}
          alt={file.name}
          className="chat__message-image"
          onLoad={onImageLoad}
          onError={onImageLoad}
        />
      )}
      <div className="chat__message-file">
        <img src={attach} alt="" />
        {url ? (
          <a href={url} download={file.name}>
            {file.name}
          </a>
        ) : (
          <span className="status-message status-message--inline" role="status">
            Загрузка файла
          </span>
        )}
      </div>
    </>
  );
}

function ChatContent() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const currentUser = useSelector((state) => state.user.user);
  const [params] = useSearchParams();
  const query = (params.get("q") || "").trim();
  const chatState = useQuery(
    () => api(`/api/chat/chats/${chatId}/`),
    chatId,
    "chats",
  );
  const reloadChat = chatState.reload;
  const chat = chatState.data;
  const messagesState = useMessages(chatId, query);
  const chatMessages = messagesState.rows;
  const people = usePeople([
    ...(chat?.participants || []),
    ...chatMessages.map((message) => message.authorId),
  ]);
  const avatar = usePrivateFile(
    attachmentsEnabled && chat?.avatar
      ? `${chat.avatar}?v=${encodeURIComponent(chat.updatedAt)}`
      : "",
  );
  const isGroupChat = chat && chat.type === "group";

  const [isModalOpen, setIsModalOpen] = useState(false);

  const [newMessage, setNewMessage] = useState("");
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const fileInputRef = useRef(null);
  const messageInputRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingAttempt, setPendingAttempt] = useState(null);
  const sendingRef = useRef(false);
  const lastRead = useRef(0);
  const pendingRead = useRef(0);
  const latest = chatMessages.at(-1)?.sequence || 0;
  const chatReady = Boolean(chat) && !chatState.loading;

  useEffect(() => {
    const handleReadUpdated = ({ detail: { topic, event } }) => {
      if (
        topic === "reads" &&
        event?.type === "read.updated" &&
        event.chat_id === chatId &&
        String(event.user_id) !== String(currentUser.id)
      ) {
        reloadChat();
      }
    };

    window.addEventListener("zotgram:changed", handleReadUpdated);

    return () => {
      window.removeEventListener("zotgram:changed", handleReadUpdated);
    };
  }, [chatId, currentUser.id, reloadChat]);

  useEffect(() => {
    const mark = async () => {
      if (
        Boolean(query) ||
        !chatReady ||
        document.visibilityState !== "visible" ||
        !document.hasFocus() ||
        latest <= Math.max(lastRead.current, pendingRead.current)
      ) {
        return;
      }

      try {
        pendingRead.current = latest;
        const result = await api(`/api/chat/chats/${chatId}/read/`, {
          method: "POST",
          body: { sequence: latest },
        });

        lastRead.current = Math.max(lastRead.current, result.sequence);
        changed("reads", {
          type: "read.updated",
          chat_id: chatId,
          user_id: currentUser.id,
          sequence: result.sequence,
          unread_count: result.unreadCount,
          last_sequence: result.lastSequence,
        });
      } catch {
        // Повторим при новом сообщении или возвращении в окно.
      } finally {
        if (pendingRead.current === latest) pendingRead.current = 0;
      }
    };

    void mark();

    window.addEventListener("focus", mark);
    document.addEventListener("visibilitychange", mark);

    return () => {
      window.removeEventListener("focus", mark);
      document.removeEventListener("visibilitychange", mark);
    };
  }, [chatId, latest, currentUser.id, chatReady, query]);

  const handleFileChange = (e) => {
    if (!attachmentsEnabled || busy || pendingAttempt) return;
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFilePreview(selectedFile.name);
    }
  };

  const handleRemoveFile = () => {
    if (busy || pendingAttempt) return;
    setFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (
      sendingRef.current ||
      (!newMessage.trim() && !(attachmentsEnabled && file))
    )
      return;
    const attempt = pendingAttempt || {
      id: crypto.randomUUID(),
      text: newMessage,
      file,
    };
    const body = new FormData();
    body.set("text", attempt.text);
    body.set("attempt_id", attempt.id);

    if (attempt.file) {
      body.set("file", attempt.file);
    }
    sendingRef.current = true;
    setPendingAttempt(attempt);
    setBusy(true);
    setError("");
    try {
      await api(`/api/chat/chats/${chatId}/messages/`, {
        method: "POST",
        body,
      });
      setNewMessage("");
      setFile(null);
      setFilePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setPendingAttempt(null);
      changed("messages");
      changed("chats");
      messageInputRef.current?.focus();
    } catch (error) {
      if (
        error.status &&
        error.status < 500 &&
        ![408, 429].includes(error.status)
      )
        setPendingAttempt(null);
      setError(statusText(error.message || "Не удалось отправить сообщение"));
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  };

  const handleUpdateChat = async (updatedChat) => {
    await api(`/api/chat/chats/${chatId}/`, {
      method: "PATCH",
      body: updatedChat,
    });
    changed("chats");
  };

  const getCompanion = () => {
    const companionId = chat.participants.find((id) => id !== currentUser.id);
    return people.data?.find((user) => String(user.id) === String(companionId));
  };

  const companion = !isGroupChat && chat ? getCompanion() : null;

  const lastMessageId = chatMessages.at(-1)?.id;

  const handleMessagesScroll = (event) => {
    const container = event.currentTarget;
    stickToBottomRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      40;
  };

  const handleImageLoad = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container && stickToBottomRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;

    if (!container) return;

    stickToBottomRef.current = true;
    container.scrollTop = container.scrollHeight;
  }, [lastMessageId, chatState.loading]);

  if (chatState.loading)
    return (
      <p className="status-message status-message--page" role="status">
        Загрузка чата
      </p>
    );
  if (!chat)
    return (
      <p className="status-message status-message--page" role="alert">
        {chatState.error || "Чат недоступен"}
      </p>
    );

  return (
    <div className="chat">
      <div className="chat__header">
        <div className="chat__header-info">
          <button className="chat__back-btn" onClick={() => navigate("/chats")}>
            <img src={back} alt="Назад"></img>
          </button>
          <div className="chat__header-avatar">
            {isGroupChat ? (
              <img
                src={
                  avatar ||
                  "https://cdn-icons-png.flaticon.com/512/3135/3135715.png"
                }
                alt={chat.name}
              />
            ) : (
              <Link
                to={companion ? `/profile/${companion.id}` : "#"}
                onClick={(event) => {
                  if (!companion) event.preventDefault();
                }}
                className="chat__header-avatar"
              >
                <div
                  className="chat__header-avatar-placeholder"
                  style={{
                    background: getUserColor(companion),
                  }}
                >
                  {companion?.name?.charAt(0) || "?"}
                  {companion?.lastname?.charAt(0) || ""}
                </div>
              </Link>
            )}
          </div>
          <div className="chat__header-details">
            <div className="chat__header-name">
              {isGroupChat
                ? chat.name
                : companion
                  ? `${companion.name} ${companion.lastname}`
                  : "Личный чат"}
            </div>
            {isGroupChat && (
              <div className="chat__header-participants">
                {chat.participants.length} уч.
              </div>
            )}
          </div>
        </div>

        {isGroupChat && (
          <button
            className="chat__header-btn"
            onClick={() => setIsModalOpen(true)}
            aria-expanded={isModalOpen}
            disabled={!groupsEnabled}
          >
            <img src={info} alt="Info" />
          </button>
        )}
      </div>

      <div
        className="chat__messages"
        ref={messagesContainerRef}
        onScroll={handleMessagesScroll}
      >
        {messagesState.older && (
          <button
            onClick={messagesState.loadOlder}
            className="chat__load-older"
          >
            Более ранние сообщения
          </button>
        )}
        {messagesState.loading && (
          <p className="status-message" role="status">
            Загрузка истории
          </p>
        )}
        {messagesState.error && (
          <div className="status-message" role="alert">
            <p className="status-message__text">{messagesState.error}</p>
            <button
              type="button"
              className="status-message__action"
              onClick={messagesState.reload}
            >
              Повторить
            </button>
          </div>
        )}
        {!messagesState.loading &&
        !messagesState.error &&
        chatMessages.length === 0 ? (
          <div className="status-message status-message--fill">
            {query ? "Сообщения не найдены" : "Нет сообщений"}
          </div>
        ) : (
          chatMessages.map((msg) => {
            const isOwn = String(msg.authorId) === String(currentUser.id);
            const isRead =
              isOwn &&
              (chat.members || []).some(
                (member) =>
                  String(member.userId) !== String(msg.authorId) &&
                  (member.lastReadSequence || 0) >= msg.sequence,
              );
            const author = isOwn
              ? currentUser
              : people.data?.find(
                  (user) => String(user.id) === String(msg.authorId),
                );
            const authorName = author?.name || "Пользователь";

            return (
              <div
                key={msg.id}
                className={`chat__message ${isOwn ? "chat__message--own" : ""}`}
              >
                {!isOwn && (
                  <div
                    className="chat__message-avatar"
                    style={{
                      background: getUserColor(isOwn ? currentUser : author),
                    }}
                  >
                    {authorName.charAt(0)}
                    {author?.lastname?.charAt(0) || ""}
                  </div>
                )}
                <div className="chat__message-content">
                  {!isOwn && (
                    <div className="chat__message-author">{authorName}</div>
                  )}
                  <div className="chat__message-bubble">
                    {msg.content && (
                      <div className="chat__message-text">{msg.content}</div>
                    )}
                    <Attachment
                      file={attachmentsEnabled ? msg.attachment : null}
                      onImageLoad={handleImageLoad}
                    />
                    <div className="chat__message-time">
                      {new Date(msg.createdAt).toLocaleDateString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}

                      {isOwn && (
                        <span
                          className="chat__message-status"
                          aria-label={
                            isRead ? "Прочитано" : "Сообщение сохранено"
                          }
                          title={isRead ? "Прочитано" : "Сообщение сохранено"}
                        >
                          <img src={readed} alt="" />
                          {isRead && <img src={readed} alt="" />}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <p className="status-message" role="alert">
          {error}{" "}
          {pendingAttempt &&
            "Повторите отправку, чтобы завершить прежнюю попытку"}
        </p>
      )}
      <form className="chat__input-form" onSubmit={handleSendMessage}>
        <div className="chat__input-wrapper">
          <button
            type="button"
            className="chat__input-attach"
            onClick={() => fileInputRef.current?.click()}
            disabled={!attachmentsEnabled || busy || Boolean(pendingAttempt)}
          >
            <img src={attach} alt="Прикрепить файл" />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            disabled={!attachmentsEnabled || busy || Boolean(pendingAttempt)}
            style={{ display: "none" }}
          />

          <input
            type="text"
            ref={messageInputRef}
            className="chat__input-field"
            placeholder="Введите сообщение..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            readOnly={busy || Boolean(pendingAttempt)}
          />

          {filePreview && (
            <div className="chat__input-file-preview">
              <img src={attach} alt="" />
              <span className="chat__input-file-name">{filePreview}</span>
              <button
                type="button"
                className="chat__input-file-remove"
                onClick={handleRemoveFile}
                disabled={busy || Boolean(pendingAttempt)}
              >
                ✕
              </button>
            </div>
          )}

          <button
            type="submit"
            className="chat__input-send"
            disabled={
              busy || (!newMessage.trim() && !(attachmentsEnabled && file))
            }
          >
            <img src={send} alt="Отправить" />
          </button>
        </div>
      </form>

      {groupsEnabled && isModalOpen && (
        <GroupInfoModal
          key={chat.id}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          chat={chat}
          onUpdateChat={handleUpdateChat}
        />
      )}
    </div>
  );
}

function Chat() {
  const { chatId } = useParams();

  return <ChatContent key={chatId} />;
}

export default Chat;
