import { useState, useRef } from "react";
import users from "../users";
import edit from "../assets/images/edit.svg";
import plus from "../assets/images/plus.svg";
import photo from "../assets/images/photo.svg";
import getUserColor from "../utils/getUserColor";

function GroupInfoModal({ isOpen, onClose, chat, onUpdateChat }) {
  const [groupName, setGroupName] = useState(chat?.name || "");
  const [avatarPreview, setAvatarPreview] = useState(chat?.avatar || "");
  const [isEditingName, setIsEditingName] = useState(false);
  const [showAddParticipants, setShowAddParticipants] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const fileInputRef = useRef(null);

  if (!isOpen || !chat) return null;

  const participants = chat.participants
    .map((id) => users.find((u) => String(u.id) === String(id)))
    .filter(Boolean);

  const availableUsers = users.filter(
    (u) => !chat.participants.some((id) => String(id) === String(u.id)),
  );

  const filteredUsers = availableUsers.filter((u) =>
    `${u.name} ${u.lastname}`.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setAvatarPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarPreview("");
    fileInputRef.current.value = "";
  };

  const handleSave = () => {
    onUpdateChat({
      ...chat,
      name: groupName,
      avatar: avatarPreview || "",
    });
    onClose();
  };

  const handleRemoveParticipant = (userId) => {
    if (window.confirm("Удалить участника из чата?")) {
      const updatedChat = {
        ...chat,
        participants: chat.participants.filter(
          (id) => String(id) !== String(userId),
        ),
      };
      onUpdateChat(updatedChat);
    }
  };

  const handleAddParticipant = (user) => {
    const updatedChat = {
      ...chat,
      participants: [...chat.participants, user.id],
    };
    onUpdateChat(updatedChat);
    setShowAddParticipants(false);
    setSearchQuery("");
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content">
        <div className="group-modal__header">
          <p>Информация о группе</p>
          <button className="group-modal__close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="group-modal__body">
          <div className="group-modal__avatar-section">
            <div className="group-modal__avatar-wrapper">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Аватар" />
              ) : (
                <div className="group-modal__avatar-placeholder">
                  {groupName.charAt(0)}
                </div>
              )}
              <button
                className="group-modal__avatar-edit"
                onClick={() => fileInputRef.current?.click()}
              >
                <img src={photo} alt="Изменить аватар" />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleAvatarChange}
                accept="image/*"
                style={{ display: "none" }}
              />
            </div>
            {avatarPreview && (
              <button
                className="group-modal__avatar-remove"
                onClick={handleRemoveAvatar}
              >
                Удалить аватар
              </button>
            )}
          </div>

          <div className="group-modal__field">
            <label>Название группы</label>
            {isEditingName ? (
              <div className="group-modal__name-edit">
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  autoFocus
                />
                <button onClick={() => setIsEditingName(false)}>✅</button>
              </div>
            ) : (
              <div className="group-modal__name-display">
                <span>{groupName}</span>
                <button
                  onClick={() => setIsEditingName(true)}
                  className="group-modal__edit-btn"
                >
                  <img src={edit} alt="Редактировать" />
                </button>
              </div>
            )}
          </div>

          <div className="group-modal__participants">
            <div className="group-modal__participants-header">
              <span>Участники ({participants.length})</span>
              <button
                className="group-modal__add-btn"
                onClick={() => setShowAddParticipants(!showAddParticipants)}
              >
                <img src={plus} alt="Добавить" />
              </button>
            </div>
            <div className="group-modal__participants-list">
              {participants.map((user) => (
                <div key={user.id} className="group-modal__participant">
                  <div
                    className="group-modal__participant-avatar"
                    style={{ background: getUserColor(user.id) }}
                  >
                    {user.name?.charAt(0) || "?"}
                    {user.lastname?.charAt(0) || ""}
                  </div>
                  <span className="group-modal__participant-name">
                    {user.name} {user.lastname}
                  </span>
                  <button
                    className="group-modal__participant-remove"
                    onClick={() => handleRemoveParticipant(user.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {showAddParticipants && (
              <div className="group-modal__add-participants">
                <input
                  type="text"
                  className="group-modal__search-input"
                  placeholder="Поиск сотрудников..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
                <div className="group-modal__search-results">
                  {filteredUsers.length === 0 ? (
                    <div className="group-modal__search-empty">
                      {searchQuery
                        ? "Ничего не найдено"
                        : "Нет доступных пользователей"}
                    </div>
                  ) : (
                    filteredUsers.map((user) => (
                      <div
                        key={user.id}
                        className="group-modal__search-item"
                        onClick={() => handleAddParticipant(user)}
                      >
                        <div
                          className="group-modal__participant-avatar"
                          style={{ background: getUserColor(user.id) }}
                        >
                          {user.name?.charAt(0) || "?"}
                          {user.lastname?.charAt(0) || ""}
                        </div>
                        <span>
                          {user.name} {user.lastname}
                        </span>
                        <button className="group-modal__search-add">
                          <img src={plus} alt="Добавить" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="group-modal__footer">
          <button className="group-modal__save-btn" onClick={handleSave}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

export default GroupInfoModal;
