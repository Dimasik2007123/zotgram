import chats from "../chats";
import { useSelector } from "react-redux";
import ChatsListItem from "./ChatsListItem.jsx";
import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";

function ChatsList() {
  const { chatId } = useParams();
  const { user } = useSelector((state) => state.user);
  const currentUserId = user?.id;
  const [isShown, setIsShown] = useState(true);

  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth < 800;
      setIsShown(!(isMobile && chatId));
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [chatId]);

  if (!isShown) return null;

  const userChats = chats.filter((chat) =>
    chat.participants.includes(currentUserId),
  );

  return (
    <div className="chats-list">
      <h2 className="chats-list__title">Сообщения</h2>
      <div className="chats-list__items">
        {userChats.map((chat) => (
          <ChatsListItem key={chat.id} chat={chat} />
        ))}
      </div>
    </div>
  );
}

export default ChatsList;
