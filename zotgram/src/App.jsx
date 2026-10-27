// App.jsx
import "./assets/styles/main.css";
import "./assets/styles/fonts.css";

import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import Header from "./components/Header";
import Footer from "./components/Footer";
import Content from "./components/Content";
import CreatePostModal from "./components/CreatePostModal";
import { changed } from "./api/client";

function App() {
  //const location = useLocation();
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

  const handlePostSubmit = () => {
    changed("posts");
  };

  if (loading) return <div className="loading-screen">Загрузка...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

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
