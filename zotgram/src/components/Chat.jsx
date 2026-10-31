import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, changed } from "../api/client";
import { useMessages, usePeople, usePrivateFile, useChat } from "../api/hooks";
import { chatAvatarUrl } from "../api/privateFiles";
import getUserColor from "../utils/getUserColor.js";
import GroupInfoModal from "./GroupInfoModal.jsx";
import info from "../assets/images/info.svg";
import back from "../assets/images/back.svg";

import ChatComposer from "./ChatComposer";
import MessageRows from "./MessageRows";
const groupsEnabled = true;

function ChatContent() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const currentUser = useSelector((state) => state.user.user);
  const [params] = useSearchParams();
  const query = (params.get("q") || "").trim();
  const chatState = useChat(chatId);
  const chat = chatState.data;
  const messagesState = useMessages(chatId, query);
  const chatMessages = messagesState.rows;
  const people = usePeople([
    ...(chat?.participants || []),
    ...chatMessages.map((message) => message.authorId),
  ]);
  const avatar = usePrivateFile(
    chatAvatarUrl(chat),
  );
  const isGroupChat = chat && chat.type === "group";
  const readThrough = (chat?.members || []).reduce((max, member) =>
    String(member.userId) === String(currentUser?.id) ? max : Math.max(max, member.lastReadSequence || 0), 0);

  const [isModalOpen, setIsModalOpen] = useState(false);

  const messagesContainerRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const lastRead = useRef(0);
  const pendingRead = useRef(0);
  const latest = messagesState.latestSequence;
  const chatReady = Boolean(chat) && !chatState.loading;

  useEffect(() => {
    const mark = async () => {
      if (
        Boolean(query) ||
        !currentUser ||
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
  }, [chatId, latest, currentUser, chatReady, query]);

  const handleUpdateChat = async (updatedChat) => {
    await api(`/api/chat/chats/${chatId}/`, {
      method: "PATCH",
      body: updatedChat,
    });
    changed("chats");
  };

  const getCompanion = () => {
    const companionId = chat.participants.find((id) => id !== currentUser?.id);
    return people.data?.find((user) => String(user.id) === String(companionId));
  };

  const companion = !isGroupChat && chat ? getCompanion() : null;

  const lastMessageId = chatMessages.at(-1)?.id;
  const lastMessageOwn = chatMessages.at(-1)?.authorId === currentUser?.id;

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

    if (stickToBottomRef.current || lastMessageOwn) {
      stickToBottomRef.current = true;
      container.scrollTop = container.scrollHeight;
    }
  }, [lastMessageId, lastMessageOwn, chatState.loading]);

  if (!currentUser) return null;
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
            disabled={messagesState.loadingOlder}
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
          <MessageRows rows={chatMessages} people={people.data} user={currentUser}
            readThrough={readThrough} onImageLoad={handleImageLoad} />
        )}
      </div>

      <ChatComposer chatId={chatId} />

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
