import statusText from "../utils/statusText";
import { useState, useRef } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { api, allPages, changed } from "../api/client";
import { useQuery, usePrivateFile } from "../api/hooks";
import { chatAvatarUrl } from "../api/privateFiles";
import getUserColor from "../utils/getUserColor";
import edit from "../assets/images/edit.svg";
import save from "../assets/images/save.svg";
import plus from "../assets/images/plus.svg";
import photo from "../assets/images/photo.svg";

const photosEnabled = true;

function GroupInfoModal({ isOpen, onClose, chat, onUpdateChat }) {
  const currentUser = useSelector((state) => state.user.user);
  const navigate = useNavigate();
  const users = useQuery(
    () => allPages("/api/core/users/"),
    "group-users",
    "profiles",
  );
  const creating = !chat;
  const isSystemChat = Boolean(chat?.systemKey);
  const canEdit = !isSystemChat && (creating || chat.myRole === "admin");
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const savedAvatar = usePrivateFile(chatAvatarUrl(chat));
  const [groupName, setGroupName] = useState(chat?.name || "");
  const [avatarPreview, setAvatarPreview] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [showAddParticipants, setShowAddParticipants] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const fileInputRef = useRef(null);

  const members = creating
    ? [
        { userId: currentUser.id, role: "admin" },
        ...selectedParticipants.map((id) => ({ userId: id, role: "member" })),
      ]
    : chat.members;
  const participants = members.map((member) => {
    const user = users.data?.find(
      (u) => String(u.id) === String(member.userId),
    );
    return {
      ...(user ||
        (member.userId === currentUser.id
          ? currentUser
          : { id: member.userId, name: member.userId })),
      role: member.role,
    };
  });
  const availableUsers = (users.data || []).filter(
    (u) => !members.some((member) => String(member.userId) === String(u.id)),
  );
  const filteredUsers = availableUsers.filter((u) =>
    `${u.name} ${u.lastname}`.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const avatar = avatarPreview || (avatarRemoved ? "" : savedAvatar);

  const runAction = async (work) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (err) {
      setError(statusText(err.message || "Не удалось сохранить изменения"));
    } finally {
      setBusy(false);
    }
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file || !photosEnabled || !canEdit || creating || busy) return;

    return runAction(async () => {
      const body = new FormData();
      body.set("avatar", file);

      await onUpdateChat(body);

      setAvatarRemoved(false);

      const reader = new FileReader();
      reader.onloadend = () => setAvatarPreview(reader.result);
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveAvatar = () => {
    if (!canEdit || creating || busy) return;

    return runAction(async () => {
      await onUpdateChat({ avatar: null });

      setAvatarPreview("");
      setAvatarRemoved(true);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    });
  };

  const handleSave = () => {
    if (!canEdit || !groupName.trim()) return;
    return runAction(async () => {
      if (creating) {
        await onUpdateChat({
          name: groupName.trim(),
          participants: selectedParticipants,
        });
        onClose();
      } else {
        await onUpdateChat({ name: groupName.trim() });
        setIsEditingName(false);
      }
    });
  };

  const handleRemoveParticipant = (userId) => {
    if (busy || isSystemChat) return;
    const leaving = String(userId) === String(currentUser.id);
    if (!canEdit && !leaving) return;
    if (creating) {
      setSelectedParticipants((ids) => ids.filter((id) => id !== userId));
      return;
    }
    return runAction(async () => {
      await api(`/api/chat/chats/${chat.id}/members/${userId}/`, {
        method: "DELETE",
      });
      changed("chats");
      if (leaving) {
        onClose();
        navigate("/chats");
      }
    });
  };

  const handleDeleteGroup = () => {
    if (!canEdit || creating || busy) return;
    return runAction(async () => {
      await api(`/api/chat/chats/${chat.id}/`, { method: "DELETE" });
      changed("chats");
      onClose();
      navigate("/chats");
    });
  };

  const handleAddParticipant = (user) => {
    if (!canEdit || busy) return;
    const finish = () => {
      setShowAddParticipants(false);
      setSearchQuery("");
    };
    if (creating) {
      setSelectedParticipants((ids) =>
        ids.includes(user.id) ? ids : [...ids, user.id],
      );
      finish();
      return;
    }
    return runAction(async () => {
      await api(`/api/chat/chats/${chat.id}/members/`, {
        method: "PUT",
        body: { user_id: user.id, role: "member" },
      });
      changed("chats");
      finish();
    });
  };

  const handleChangeRole = (user) => {
    if (!canEdit || creating || busy) return;
    return runAction(async () => {
      await api(`/api/chat/chats/${chat.id}/members/`, {
        method: "PUT",
        body: {
          user_id: user.id,
          role: user.role === "admin" ? "member" : "admin",
        },
      });
      changed("chats");
    });
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget && !busy) onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content">
        <div className="group-modal__header">
          <p>{creating ? "Создать группу" : "Информация о группе"}</p>
          <button
            className="group-modal__close"
            disabled={busy}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="group-modal__body">
          {error && (
            <p className="status-message" role="alert">
              {error}
            </p>
          )}
          {users.loading && (
            <p className="status-message" role="status">
              Загрузка сотрудников
            </p>
          )}
          {users.error && (
            <div className="status-message" role="alert">
              <p className="status-message__text">{users.error}</p>
              <button className="status-message__action" onClick={users.reload}>
                Повторить
              </button>
            </div>
          )}
          <div className="group-modal__avatar-section">
            <div className="group-modal__avatar-wrapper">
              {avatar ? (
                <img src={avatar} alt="Аватар" />
              ) : (
                <div className="group-modal__avatar-placeholder">
                  {groupName.charAt(0)}
                </div>
              )}
              {canEdit && (
                <button
                  className="group-modal__avatar-edit"
                  disabled={busy || creating || !photosEnabled}
                  title={
                    !photosEnabled
                      ? "Фото группы — шаг 43"
                      : creating
                        ? "Сначала создайте группу"
                        : "Изменить аватар"
                  }
                  onClick={() => fileInputRef.current?.click()}
                >
                  <img src={photo} alt="Изменить аватар" />
                </button>
              )}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleAvatarChange}
                disabled={busy || !canEdit || creating || !photosEnabled}
                accept="image/png,image/jpeg,image/webp,image/gif"
                style={{ display: "none" }}
              />
            </div>
            {avatar && canEdit && photosEnabled && !creating && (
              <button
                className="group-modal__avatar-remove"
                onClick={handleRemoveAvatar}
                disabled={busy}
              >
                Удалить аватар
              </button>
            )}
          </div>

          <div className="group-modal__field">
            <label>Название группы</label>
            {canEdit && (isEditingName || creating) ? (
              <div className="group-modal__name-edit">
                <input
                  type="text"
                  value={groupName}
                  disabled={busy}
                  maxLength={150}
                  onChange={(e) => setGroupName(e.target.value)}
                  autoFocus
                />
                {!creating && (
                  <button
                    type="button"
                    className="group-modal__edit-btn group-modal__name-save-btn"
                    aria-label="Сохранить название"
                    title="Сохранить название"
                    disabled={busy || !groupName.trim()}
                    onClick={handleSave}
                  >
                    <img src={save} alt="" />
                  </button>
                )}
              </div>
            ) : (
              <div className="group-modal__name-display">
                <span>{groupName}</span>
                {canEdit && (
                  <button
                    disabled={busy}
                    onClick={() => setIsEditingName(true)}
                    className="group-modal__edit-btn"
                  >
                    <img src={edit} alt="Редактировать" />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="group-modal__participants">
            <div className="group-modal__participants-header">
              <span>Участники ({participants.length})</span>
              {canEdit && (
                <button
                  disabled={busy}
                  className="group-modal__add-btn"
                  onClick={() => setShowAddParticipants(!showAddParticipants)}
                >
                  <img src={plus} alt="Добавить" />
                </button>
              )}
            </div>
            <div className="group-modal__participants-list">
              {participants.map((user) => (
                <div key={user.id} className="group-modal__participant">
                  <div
                    className="group-modal__participant-avatar"
                    style={{ background: getUserColor(user) }}
                  >
                    {user.name?.charAt(0) || "?"}
                    {user.lastname?.charAt(0) || ""}
                  </div>
                  <span className="group-modal__participant-name">
                    {user.name} {user.lastname}
                    {!isSystemChat && user.role === "admin" ? " · Админ" : ""}
                  </span>
                  {canEdit && !creating && (
                    <button
                      type="button"
                      className={`group-modal__role-btn${user.role === "admin" ? " group-modal__role-btn--admin" : ""}`}
                      disabled={busy}
                      onClick={() => handleChangeRole(user)}
                    >
                      {user.role === "admin" ? "Снять роль" : "Админ"}
                    </button>
                  )}
                  {canEdit && user.id !== currentUser.id && (
                    <button
                      disabled={busy}
                      className="group-modal__participant-remove"
                      onClick={() => handleRemoveParticipant(user.id)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            {canEdit && showAddParticipants && (
              <div className="group-modal__add-participants">
                <input
                  type="text"
                  className="group-modal__search-input"
                  placeholder="Поиск сотрудников..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  disabled={busy}
                  autoFocus
                />
                <div className="group-modal__search-results">
                  {!users.loading &&
                    !users.error &&
                    (filteredUsers.length === 0 ? (
                      <div className="status-message">
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
                            style={{ background: getUserColor(user) }}
                          >
                            {user.name?.charAt(0) || "?"}
                            {user.lastname?.charAt(0) || ""}
                          </div>
                          <span>
                            {user.name} {user.lastname}
                          </span>
                          <button
                            className="group-modal__search-add"
                            disabled={busy}
                            aria-label={`Добавить ${user.name}`}
                          >
                            <img src={plus} alt="Добавить" />
                          </button>
                        </div>
                      ))
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="group-modal__footer">
          {canEdit && creating && (
            <button
              type="button"
              className="group-modal__save-btn"
              disabled={busy || !groupName.trim()}
              onClick={handleSave}
            >
              Создать
            </button>
          )}
          {!creating && !isSystemChat && (
            <button
              type="button"
              className="group-modal__avatar-remove"
              disabled={busy}
              onClick={() => handleRemoveParticipant(currentUser.id)}
            >
              Выйти из группы
            </button>
          )}
          {!creating && canEdit && (
            <button
              type="button"
              className="group-modal__delete-btn"
              disabled={busy}
              onClick={handleDeleteGroup}
            >
              Удалить группу
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default GroupInfoModal;
