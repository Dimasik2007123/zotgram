import statusText from "../utils/statusText";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { api, allPages, changed } from "../api/client";
import { useQuery } from "../api/hooks";
import { logoutSession } from "../api/session";
import { updateUser } from "../store/userReducer";
import { openDirectChat } from "../api/chats";
import Post from "../components/Post";
import save from "../assets/images/save.svg";
import logout_image from "../assets/images/logout.svg";
import getUserColor from "../utils/getUserColor";

function ProfileContent({ userId }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const currentUser = useSelector((state) => state.user.user);
  const isCurrentUser = String(userId) === String(currentUser?.id);
  const profile = useQuery(
    () => api(`/api/core/users/${userId}/`),
    userId,
    "profiles",
  );
  const departments = useQuery(
    () => api("/api/core/departments/"),
    "departments",
  );
  const postsState = useQuery(
    () => allPages(`/api/core/posts/?author=${userId}`),
    userId,
    "posts",
  );

  const posts = postsState.data || [];
  const [draft, setDraft] = useState({});
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const profileUser = profile.data ? { ...profile.data, ...draft } : null;
  const isFollowing =
    profile.data?.followers?.includes(currentUser?.id) || false;

  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await logoutSession();
      navigate("/login", { replace: true });
    } catch (error) {
      setError(statusText(error.message || "Не удалось выйти. Попробуй снова"));
    } finally {
      setBusy(false);
    }
  }

  const handleSave = (field, value) => {
    if (!isCurrentUser || busy) return;
    setSuccess("");
    const nextValue =
      field === "birthDate" || field === "department" ? value || null : value;
    setDraft((previous) => ({ ...previous, [field]: nextValue }));
    setEditingField(null);
    setEditValue("");
  };

  const handleSaveAll = async () => {
    if (!isCurrentUser || busy || !profileUser) return;
    const body = {};
    ["name", "lastname", "email", "phone", "bio"].forEach((field) => {
      body[field] = profileUser[field] || "";
    });
    body.birthDate = profileUser.birthDate || null;
    body.department = profileUser.department || null;
    if (editingField) {
      body[editingField] =
        editingField === "birthDate" || editingField === "department"
          ? editValue || null
          : editValue;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const updated = await api("/api/core/me/", { method: "PATCH", body });
      dispatch(updateUser(updated));
      setDraft(updated);
      setEditingField(null);
      setEditValue("");
      setSuccess("Изменения сохранены");
      changed("profiles");
    } catch (error) {
      setError(statusText(error.message || "Не удалось сохранить профиль"));
    } finally {
      setBusy(false);
    }
  };

  const handleFollowToggle = async () => {
    if (busy) return;

    setBusy(true);
    setError("");

    try {
      await api(`/api/core/users/${userId}/follow/`, {
        method: isFollowing ? "DELETE" : "PUT",
      });
      changed("profiles");
      changed("posts");
    } catch (error) {
      setError(statusText(error.message || "Не удалось изменить подписку"));
    } finally {
      setBusy(false);
    }
  };

  const handleMessage = async (recipientId) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const chatId = await openDirectChat(recipientId);
      navigate(`/chats/${chatId}`);
    } catch (error) {
      setError(statusText(error.message || "Не удалось открыть чат"));
    } finally {
      setBusy(false);
    }
  };

  const startEditing = (field, value) => {
    setSuccess("");
    setEditingField(field);
    setEditValue(value || "");
  };

  const handleKeyDown = (event, field) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSave(field, editValue);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setEditingField(null);
      setEditValue("");
    }
  };

  const renderField = (label, field, value) => {
    if (!isCurrentUser && field === "bio") return null;
    const isEditing = editingField === field;
    const isDepartment = field === "department";
    const departmentName =
      departments.data?.find((department) => department.id === value)?.name ||
      (value === profile.data.department ? profile.data.departmentName : "") ||
      "Не указан";
    return (
      <div className="profile__field">
        <strong>{label}:</strong>
        {isEditing ? (
          isDepartment ? (
            <select
              className="profile__input"
              aria-label={label}
              value={editValue || ""}
              onChange={(event) => handleSave(field, event.target.value)}
              autoFocus
              disabled={busy}
            >
              <option value="">Не указан</option>
              {departments.data?.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={
                field === "birthDate"
                  ? "date"
                  : field === "email"
                    ? "email"
                    : "text"
              }
              className="profile__input"
              aria-label={label}
              value={editValue}
              onChange={(event) => setEditValue(event.target.value)}
              onBlur={(event) => handleSave(field, event.target.value)}
              onKeyDown={(event) => handleKeyDown(event, field)}
              autoFocus
              disabled={busy}
            />
          )
        ) : (
          <span className="profile__value">
            {isDepartment ? departmentName : value || "Не указано"}
          </span>
        )}
        {isCurrentUser && !isEditing && (
          <button
            type="button"
            className="profile__edit-icon"
            onClick={() => startEditing(field, value)}
            title="Редактировать"
            aria-label={`Редактировать: ${label}`}
            disabled={busy || (isDepartment && departments.loading)}
          >
            ✏️
          </button>
        )}
      </div>
    );
  };

  if (!currentUser)
    return <div className="status-message status-message--page">Вы не авторизованы</div>;
  if (profile.loading)
    return <div className="status-message status-message--page" role="status">Загрузка профиля</div>;
  if (!profileUser) {
    return (
      <div className="status-message status-message--page">
        <p className="status-message__text">{profile.error || "Пользователь не найден"}</p>
        <Link to="/" className="status-message__action">Вернуться на главную</Link>
      </div>
    );
  }

  return (
    <div className="profile">
      <div className="profile__header">
        <div className="profile__avatar">
          <div
            className="profile__avatar-placeholder"
            style={{ background: getUserColor(profileUser) }}
          >
            {profileUser.name?.charAt(0) || "П"}
            {profileUser.lastname?.charAt(0) || ""}
          </div>
        </div>
        <h1>
          {profileUser.name} {profileUser.lastname}
        </h1>
        <p className="profile__bio">{profileUser.bio || "Нет описания"}</p>
      </div>

      {error && <p className="status-message" role="alert">{error}</p>}
      {isCurrentUser && success && (
        <p className="profile__success" role="status">
          {success}
        </p>
      )}
      {profile.error && <p className="status-message" role="alert">{profile.error}</p>}
      {departments.error && <p className="status-message" role="alert">{departments.error}</p>}
      <div className="profile__info">
        {renderField("Имя", "name", profileUser.name)}
        {renderField("Фамилия", "lastname", profileUser.lastname)}
        {renderField("Email", "email", profileUser.email)}
        {renderField("Телефон", "phone", profileUser.phone)}
        {renderField("Дата рождения", "birthDate", profileUser.birthDate)}
        {renderField("О себе", "bio", profileUser.bio)}
        {renderField("Отдел", "department", profileUser.department)}
      </div>

      {isCurrentUser ? (
        <div className="profile__actions">
          <button
            className="profile__save-all-btn"
            disabled={busy}
            onClick={handleSaveAll}
          >
            <img
              src={save}
              alt="Сохранить"
              className="header__menu-link-image"
            />
            Сохранить все изменения
          </button>
          <button
            className="profile__logout-btn"
            disabled={busy}
            onClick={handleLogout}
          >
            <img
              src={logout_image}
              alt="Выйти"
              className="header__menu-link-image"
            />
            Выйти из аккаунта
          </button>
        </div>
      ) : (
        <div className="profile__actions">
          <button
            className="profile__send-message-btn"
            disabled={busy}
            onClick={() => handleMessage(profileUser.id)}
          >
            Перейти в чат
          </button>
          <button
            className={`profile__follow-btn ${isFollowing ? "following" : ""}`}
            disabled={busy}
            onClick={handleFollowToggle}
          >
            {isFollowing ? "Отписаться" : "Подписаться"}
          </button>
        </div>
      )}

      <div className="profile__posts-list">
        {postsState.loading && <p className="status-message" role="status">Загрузка публикаций</p>}

        {postsState.error && (
          <div className="status-message" role="alert">
            <p className="status-message__text">{postsState.error}</p>
            <button
              type="button"
              className="status-message__action"
              onClick={postsState.reload}
            >
              Повторить
            </button>
          </div>
        )}

        {!postsState.loading && !postsState.error && posts.length === 0 && (
          <p className="status-message">Публикаций пока нет</p>
        )}

        {posts.map((post) => (
          <Post key={post.id} post={post} showActivity={!isCurrentUser} />
        ))}
      </div>
    </div>
  );
}

function Profile() {
  const { userId } = useParams();
  return <ProfileContent key={userId} userId={userId} />;
}

export default Profile;
