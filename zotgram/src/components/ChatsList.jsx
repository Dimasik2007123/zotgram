import ChatsListItem from "./ChatsListItem.jsx";
import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useQuery } from "../api/hooks";
import { allPages } from "../api/client";

function ChatsList() {
  const { chatId } = useParams();
  const chats = useQuery(() => allPages("/api/chat/chats/"), "chats", "chats");
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 800);
  const isShown = !(isMobile && chatId);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 800);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!isShown) return null;

  const userChats = chats.data || [];

  return (
    <div className="chats-list">
      <h2 className="chats-list__title">Сообщения</h2>
      {chats.error && (
        <p role="alert">
          {chats.error} <button onClick={chats.reload}>Повторить</button>
        </p>
      )}
      {chats.loading && <p>Загрузка…</p>}
      <div className="chats-list__items">
        {userChats.map((chat) => (
          <ChatsListItem key={chat.id} chat={chat} />
        ))}
      </div>
      {!chats.loading && !chats.error && userChats.length === 0 && (
        <p>Чатов пока нет.</p>
      )}
    </div>
  );
}

export default ChatsList;
