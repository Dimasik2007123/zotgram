import { useParams, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { useState, useRef } from "react";
import chats from "../chats.js";
import { Link } from "react-router-dom";
import users from "../users.js";
import messages from "../messages.js";
import getUserColor from "../utils/getUserColor.js";
import info from "../assets/images/info.svg";
import attach from "../assets/images/file.svg";
import send from "../assets/images/send.svg";
import back from "../assets/images/back.svg";

import GroupInfoModal from "./GroupInfoModal.jsx";

function Chat() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const currentUser = useSelector((state) => state.user.user);
  const chat = chats.find((c) => c.id === chatId);
  const isGroupChat = chat && chat.type === "group";

  const [isModalOpen, setIsModalOpen] = useState(false);

  const [newMessage, setNewMessage] = useState("");
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFilePreview(selectedFile.name);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setFilePreview(null);
    fileInputRef.current.value = "";
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim() && !file) return;

    // TODO: отправка сообщения
    console.log("Сообщение:", newMessage);
    console.log("Файл:", file);

    setNewMessage("");
    setFile(null);
    setFilePreview(null);
    fileInputRef.current.value = "";
  };

  const handleUpdateChat = (updatedChat) => {
    console.log("Обновлённый чат:", updatedChat);
    // TODO: обновить чат в глобальном состоянии
  };

  const getCompanion = () => {
    const companionId = chat.participants.find((id) => id !== currentUser.id);
    return users.find((u) => String(u.id) === String(companionId));
  };

  const companion = !isGroupChat ? getCompanion() : null;

  const chatMessages = messages.filter((m) => m.chatId === chatId);

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
                  chat.avatar ||
                  "https://cdn-icons-png.flaticon.com/512/3135/3135715.png"
                }
                alt={chat.name}
              />
            ) : (
              <Link
                to={`/profile/${companion?.id}`}
                className="chat__header-avatar"
              >
                <div
                  className="chat__header-avatar-placeholder"
                  style={{
                    background: getUserColor(companion?.id || ""),
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
                : `${companion?.name || ""} ${companion?.lastname || ""}`}
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
          >
            <img src={info} alt="Info" />
          </button>
        )}
      </div>

      <div className="chat__messages">
        {chatMessages.length === 0 ? (
          <div className="chat__messages-empty">Нет сообщений</div>
        ) : (
          chatMessages.map((msg) => {
            const isOwn = String(msg.authorId) === String(currentUser.id);
            const author = users.find(
              (u) => String(u.id) === String(msg.authorId),
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
                    style={{ background: getUserColor(msg.authorId) }}
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
                    {msg.type === "image" ? (
                      <img
                        src={msg.content}
                        alt="Изображение"
                        className="chat__message-image"
                      />
                    ) : msg.type === "file" ? (
                      <div className="chat__message-file">📎 Файл</div>
                    ) : (
                      <div className="chat__message-text">{msg.content}</div>
                    )}
                    <div className="chat__message-time">
                      {new Date(msg.createdAt).toLocaleTimeString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form className="chat__input-form" onSubmit={handleSendMessage}>
        <div className="chat__input-wrapper">
          <button
            type="button"
            className="chat__input-attach"
            onClick={() => fileInputRef.current?.click()}
          >
            <img src={attach} alt="Прикрепить файл" />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{ display: "none" }}
          />

          <input
            type="text"
            className="chat__input-field"
            placeholder="Введите сообщение..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
          />

          {filePreview && (
            <div className="chat__input-file-preview">
              <span>📎 {filePreview}</span>
              <button
                type="button"
                className="chat__input-file-remove"
                onClick={handleRemoveFile}
              >
                ✕
              </button>
            </div>
          )}

          <button
            type="submit"
            className="chat__input-send"
            disabled={!newMessage.trim() && !file}
          >
            <img src={send} alt="Отправить" />
          </button>
        </div>
      </form>

      <GroupInfoModal
        key={chat.id}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        chat={chat}
        onUpdateChat={handleUpdateChat}
      />
    </div>
  );
}

export default Chat;
