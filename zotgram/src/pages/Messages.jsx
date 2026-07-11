import ChatsList from "../components/ChatsList.jsx";
import { Outlet, useParams } from "react-router-dom";
import { useState, useEffect } from "react";

function Messages() {
  const { chatId } = useParams();
  const [isShown, setIsShown] = useState(true);

  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth < 800;
      setIsShown(!(isMobile && !chatId));
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [chatId]);

  if (!isShown)
    return (
      <div className="messages">
        <ChatsList />
      </div>
    );

  return (
    <div className="messages">
      <ChatsList />
      {chatId ? (
        <Outlet />
      ) : (
        <div className="messages__placeholder">
          <p>Выберите чат, чтобы начать общение</p>
        </div>
      )}
    </div>
  );
}

export default Messages;
