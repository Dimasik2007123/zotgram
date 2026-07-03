// App.jsx
import "./assets/styles/main.css";
import "./assets/styles/fonts.css";

import { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom"; // ← добавить Navigate
import Header from "./components/Header";
import Footer from "./components/Footer";
import Content from "./components/Content";
import CreatePostModal from "./components/CreatePostModal";

function App() {
  const navigate = useNavigate();
  //const location = useLocation();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [user, setUser] = useState(() => {
    // Потом localStorage
    const saved = localStorage.getItem("user");
    return saved ? JSON.parse(saved) : null;
  });

  const [loading] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("yandex_token");
    setUser(null);
    navigate("/login");
  };

  const handlePostSubmit = (newPost) => {
    console.log("Новый пост:", newPost);
    // здесь добавишь пост в ленту
  };

  if (loading) {
    return <div className="loading-screen">Загрузка...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  return (
    <div className="app">
      <Header
        onLogout={handleLogout}
        onOpenModal={() => setIsModalOpen(true)}
      />
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
