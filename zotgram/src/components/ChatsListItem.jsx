import { useSelector } from "react-redux";
import { Link, useParams } from "react-router-dom";

import getUserColor from "../utils/getUserColor";
import { usePeople } from "../api/hooks";
import fileIcon from "../assets/images/file.svg";
import photoIcon from "../assets/images/photo.svg";
import defaultGroup from "../assets/images/default-group.png";

function ChatsListItem({ chat }) {
  const { chatId } = useParams();
  const isGroupChat = chat.type === "group";
  const currentUser = useSelector((state) => state.user.user);
  const lastMessage = chat.lastMessage;
  const people = usePeople(
    isGroupChat ? [lastMessage?.authorId] : chat.participants,
  );
  const avatar = "";

  const getCompanion = () => {
    const companionId = chat.participants.find((id) => id !== currentUser.id);
    return people.data?.find((user) => String(user.id) === String(companionId));
  };

  const companion = !isGroupChat ? getCompanion() : null;

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();

    // Обнуляем время для корректного сравнения дней
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const messageDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );

    const diffDays = Math.floor((today - messageDate) / 86400000);

    if (diffDays === 0) {
      return date.toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (diffDays === 1) {
      return "Вчера";
    } else if (diffDays < 7) {
      const weekdays = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
      return weekdays[date.getDay()];
    } else {
      return date.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
      });
    }
  };

  const getLastMessageText = () => {
    if (!lastMessage) return "Нет сообщений";

    const author =
      String(lastMessage.authorId) === String(currentUser.id)
        ? currentUser
        : people.data?.find(
            (user) => String(user.id) === String(lastMessage.authorId),
          );
    const authorName = author?.name || "Пользователь";

    const isOwnMessage =
      String(lastMessage.authorId) === String(currentUser.id);
    const prefix = isOwnMessage ? "Вы: " : `${authorName}: `;

    const attachment = lastMessage.attachment;
    if (attachment) {
      const isImage = attachment.mime?.startsWith("image/") || false;
      return (
        <>
          {prefix}
          <img
            className="chats-list-item__attachment-icon"
            src={isImage ? photoIcon : fileIcon}
            alt=""
          />
          {lastMessage.content || (isImage ? "Изображение" : "Файл")}
        </>
      );
    }
    return `${prefix}${lastMessage.content}`;
  };

  const unreadCount = 0;

  return (
    <Link
      to={`/chats/${chat.id}`}
      className={`chats-list-item ${chatId === chat.id ? "chats-list-item--active" : ""}`}
    >
      <div className="chats-list-item__avatar">
        {isGroupChat ? (
          <img src={avatar || defaultGroup} alt={chat.name} />
        ) : (
          <div
            className="chats-list-item__avatar-placeholder"
            style={{
              background: getUserColor(companion),
            }}
          >
            {companion?.name?.charAt(0) || "?"}
            {companion?.lastname?.charAt(0) || ""}
          </div>
        )}
      </div>
      <div className="chats-list-item__content">
        <div className="chats-list-item__name">
          {isGroupChat
            ? chat.name
            : companion
              ? `${companion.name} ${companion.lastname}`
              : "Личный чат"}
        </div>
        <div className="chats-list-item__last-message">
          {getLastMessageText()}
        </div>
      </div>

      <div className="chats-list-item__meta">
        <div className="chats-list-item__date">
          {lastMessage ? formatDate(lastMessage.createdAt) : ""}
        </div>
        {unreadCount > 0 && (
          <div className="chats-list-item__unread">{unreadCount}</div>
        )}
      </div>
    </Link>
  );
}

export default ChatsListItem;
