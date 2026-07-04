import { useState, useRef } from "react";
import getUserColor from "../utils/getUserColor";

function CreatePostModal({ isOpen, onClose, onPostSubmit }) {
  const [text, setText] = useState("");
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef(null);

  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setImage(null);
    setImagePreview(null);
    fileInputRef.current.value = "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() && !image) return;

    setIsLoading(true);

    const newPost = {
      id: crypto.randomUUID(),
      userId: currentUser.id || 1,
      firstName: currentUser.name || "Пользователь",
      lastName: currentUser.lastname || "",
      avatar: "https://i.pravatar.cc/150?img=" + (currentUser.id || 1),
      date: new Date().toISOString(),
      text: text.trim(),
      image: imagePreview || null,
      likes: [],
      comments: [],
    };

    await new Promise((resolve) => setTimeout(resolve, 500));

    onPostSubmit(newPost);
    setText("");
    setImage(null);
    setImagePreview(null);
    setIsLoading(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content">
        <div className="create-post">
          <div className="create-post__header">
            <p>Создать пост</p>
            <button className="create-post__close" onClick={onClose}>
              ✕
            </button>
          </div>

          <div className="create-post__main">
            <div className="create-post__author">
              <div
                className="create-post__author-avatar link-profile link-profile--big"
                style={{ background: getUserColor(currentUser.id) }}
              >
                {currentUser.name
                  ? currentUser.name.charAt(0) +
                    (currentUser.lastname?.charAt(0) || "")
                  : "П"}
              </div>
              <div className="create-post__author-infotext">
                <div className="create-post__author-name">
                  {currentUser.name || "Пользователь"}{" "}
                  {currentUser.lastname || ""}
                </div>
                <div className="create-post__author-infodesc">
                  Поделитесь со всеми
                </div>
              </div>
            </div>

            <form className="create-post__form" onSubmit={handleSubmit}>
              <textarea
                className="create-post__input"
                placeholder="Что у вас нового?"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
              />

              {imagePreview && (
                <div className="create-post__image-preview">
                  <img src={imagePreview} alt="Превью" />
                  <button
                    type="button"
                    className="create-post__image-remove"
                    onClick={handleRemoveImage}
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="create-post__actions">
                <button
                  type="button"
                  className="create-post__attach-btn"
                  onClick={() => fileInputRef.current.click()}
                >
                  📎 Фото
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  accept="image/*"
                  style={{ display: "none" }}
                />

                <button
                  type="submit"
                  className="create-post__submit-btn"
                  disabled={(!text.trim() && !image) || isLoading}
                >
                  {isLoading ? "Публикация..." : "Опубликовать"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreatePostModal;
