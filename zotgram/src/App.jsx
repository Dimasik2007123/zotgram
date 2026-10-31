import "./assets/styles/main.css";

import { useState, useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { startMessageNotifications } from "./api/notifications";
import Header from "./components/Header";
import Footer from "./components/Footer";
import Content from "./components/Content";
import CreatePostModal from "./components/CreatePostModal";
import { changed } from "./api/client";
import { startRealtime } from "./api/realtime";
import { startChatUpdates } from "./api/chatUpdates";

function App() {
  const dispatch = useDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const userId = useSelector((state) => state.user.user?.id);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { isAuthenticated, loading } = useSelector((state) => state.user);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    const stopUpdates = startChatUpdates(dispatch);
    const stopRealtime = startRealtime();
    return () => {
      stopUpdates();
      stopRealtime();
    };
  }, [dispatch, isAuthenticated, userId]);

  useEffect(() => {
    if (!isAuthenticated || !userId) return;

    return startMessageNotifications(userId, navigate);
  }, [isAuthenticated, userId, navigate]);

  const handlePostSubmit = () => {
    changed("posts");
  };

  if (loading)
    return (
      <div className="status-message status-message--page" role="status">
        Загрузка
      </div>
    );
  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location.pathname + location.search + location.hash,
        }}
      />
    );
  }

  return (
    <div className="app">
      <Header onOpenModal={() => setIsModalOpen(true)} />
      <Content />
      {isMobile && <Footer onOpenModal={() => setIsModalOpen(true)} />}

      <CreatePostModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onPostSubmit={handlePostSubmit}
      />
    </div>
  );
}

export default App;
