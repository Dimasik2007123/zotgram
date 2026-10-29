import ChatsListItem from "./ChatsListItem.jsx";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useChats, useQuery } from "../api/hooks";
import { api, changed, allPages } from "../api/client";

import GroupInfoModal from "./GroupInfoModal.jsx";

function ChatsList() {
  const { chatId } = useParams();
  const sharedChats = useChats();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 800);
  const isShown = !(isMobile && chatId);
  const [params] = useSearchParams();
  const query = chatId ? "" : (params.get("q") || "").trim();
  const search = useQuery(
    () =>
      query
        ? allPages(
            `/api/chat/chats/?q=${encodeURIComponent(query)}&page_size=100`,
          )
        : Promise.resolve([]),
    query,
    "chats profiles",
  );

  const chats = query
    ? {
        ...search,
        data: search.data?.map((item) => {
          const cached = sharedChats.data?.find((chat) => chat.id === item.id);
          const freshCount =
            cached &&
            cached.lastReadSequence >= item.lastReadSequence &&
            Math.max(cached.lastSequence, cached.countedSequence || 0) >=
              item.lastSequence;
          return freshCount
            ? { ...item, unreadCount: cached.unreadCount }
            : item;
        }),
      }
    : sharedChats;

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 800);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleCreateChat = async (body) => {
    const chat = await api("/api/chat/chats/", { method: "POST", body });
    changed("chats");
    setIsCreateModalOpen(false);
    navigate(`/chats/${chat.id}`);
  };

  if (!isShown) return null;

  const userChats = chats.data || [];

  return (
    <div className="chats-list">
      <h2 className="chats-list__title">Сообщения</h2>
      {chats.error && (
        <div className="status-message" role="alert">
          <p className="status-message__text">{chats.error}</p>
          <button
            type="button"
            className="status-message__action"
            onClick={chats.reload}
          >
            Повторить
          </button>
        </div>
      )}
      {chats.loading && (
        <p className="status-message" role="status">
          Загрузка
        </p>
      )}
      <div className="chats-list__items">
        {userChats.map((chat) => (
          <ChatsListItem key={chat.id} chat={chat} />
        ))}
      </div>
      {!chats.loading && !chats.error && userChats.length === 0 && (
        <p className="status-message">
          {query ? "Чаты не найдены" : "Чатов пока нет"}
        </p>
      )}

      <button
        type="button"
        className="create-group-button"
        onClick={() => setIsCreateModalOpen(true)}
      >
        Создать группу
      </button>

      {isCreateModalOpen && (
        <GroupInfoModal
          isOpen
          onClose={() => setIsCreateModalOpen(false)}
          chat={null}
          onUpdateChat={handleCreateChat}
        />
      )}
    </div>
  );
}

export default ChatsList;
