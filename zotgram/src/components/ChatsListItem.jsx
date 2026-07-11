import { useSelector } from "react-redux";
import { Link, useParams } from "react-router-dom";

import getUserColor from "../utils/getUserColor";
import { getUnreadCount } from "../utils/getUnreadCount";
import users from "../users";
import messages from "../messages";

function ChatsListItem({ chat }) {
  const { chatId } = useParams();
  const isGroupChat = chat.type === "group";
  const currentUser = useSelector((state) => state.user.user);

  const getCompanion = () => {
    const companionId = chat.participants.find((id) => id !== currentUser.id);
    return users.find((u) => String(u.id) === String(companionId));
  };

  const companion = !isGroupChat ? getCompanion() : null;

  const lastMessage = messages
    .filter((m) => m.chatId === chat.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

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

    const author = users.find(
      (u) => String(u.id) === String(lastMessage.authorId),
    );
    const authorName = author?.name || "Пользователь";

    const isOwnMessage =
      String(lastMessage.authorId) === String(currentUser.id);
    const prefix = isOwnMessage ? "Вы: " : `${authorName}: `;

    if (lastMessage.type === "file") return `${prefix}📎 Файл`;
    if (lastMessage.type === "image") return `${prefix}🖼️ Изображение`;
    return `${prefix}${lastMessage.content}`;
  };

  const unreadCount = getUnreadCount(chat.id, currentUser.id);

  return (
    <Link
      to={`/chats/${chat.id}`}
      className={`chats-list-item ${chatId === chat.id ? "chats-list-item--active" : ""}`}
    >
      <div className="chats-list-item__avatar">
        {isGroupChat ? (
          <img
            src={
              chat.avatar ||
              "https://cdn-icons-png.flaticon.com/512/3135/3135715.png"
            }
            alt={chat.name}
          />
        ) : (
          <div
            className="chats-list-item__avatar-placeholder"
            style={{
              background: getUserColor(companion?.id || ""),
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
            : `${companion?.name || ""} ${companion?.lastname || ""}`}
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
