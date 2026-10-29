import statusText from "../utils/statusText";
import { useState, useRef } from "react";
import { useSelector } from "react-redux";
import getUserColor from "../utils/getUserColor";
import photo from "../assets/images/photo.svg";
import { api } from "../api/client";

function CreatePostModal({ isOpen, onClose, onPostSubmit }) {
  const [text, setText] = useState("");
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const { user: currentUser } = useSelector((state) => state.user);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget && !isLoading) onClose();
  };

  const handleImageChange = (e) => {
    if (isLoading) return;
    setError("");
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    if (isLoading) return;

    setImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isLoading || (!text.trim() && !image)) return;

    setIsLoading(true);
    setError("");

    try {
      const body = new FormData();
      body.set("text", text.trim());

      if (image) {
        body.set("image", image);
      }

      const newPost = await api("/api/core/posts/", {
        method: "POST",
        body,
      });

      onPostSubmit(newPost);

      setText("");
      setImage(null);
      setImagePreview(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      onClose();
    } catch (error) {
      setError(statusText(error.message || "Не удалось опубликовать пост"));
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content">
        <div className="create-post">
          <div className="create-post__header">
            <p>Создать пост</p>
            <button
              className="create-post__close"
              onClick={onClose}
              disabled={isLoading}
            >
              ✕
            </button>
          </div>

          <div className="create-post__main">
            <div className="create-post__author">
              <div
                className="create-post__author-avatar link-profile link-profile--big"
                style={{ background: getUserColor(currentUser) }}
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

            {error && <p className="status-message" role="alert">{error}</p>}

            <form className="create-post__form" onSubmit={handleSubmit}>
              <textarea
                className="create-post__input"
                placeholder="Что у вас нового?"
                value={text}
                disabled={isLoading}
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
                    disabled={isLoading}
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="create-post__actions">
                <button
                  type="button"
                  className="create-post__attach-btn"
                  disabled={isLoading}
                  onClick={() => fileInputRef.current.click()}
                >
                  <img src={photo} alt="" />
                  Фото
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  disabled={isLoading}
                  style={{ display: "none" }}
                />

                <button
                  type="submit"
                  className="create-post__submit-btn"
                  disabled={(!text.trim() && !image) || isLoading}
                >
                  {isLoading ? "Публикация" : "Опубликовать"}
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
