import localPosts from "../posts";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { api, changed } from "../api/client";
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
  const posts = localPosts;
  const [draft, setDraft] = useState({});
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const profileUser = profile.data ? { ...profile.data, ...draft } : null;
  const isFollowing = profile.data?.followers?.includes(currentUser?.id) || false;

  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await logoutSession();
      navigate("/login", { replace: true });
    } catch (error) {
      setError(error.message || "Не удалось выйти. Попробуй снова.");
    } finally {
      setBusy(false);
    }
  }

  const handleSave = (field, value) => {
    if (!isCurrentUser || busy) return;
    const nextValue = field === "birthDate" || field === "department" ? value || null : value;
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
      body[editingField] = editingField === "birthDate" || editingField === "department"
        ? editValue || null : editValue;
    }
    setBusy(true);
    setError("");
    try {
      const updated = await api("/api/core/me/", { method: "PATCH", body });
      dispatch(updateUser(updated));
      setDraft(updated);
      setEditingField(null);
      setEditValue("");
      changed("profiles");
    } catch (error) {
      setError(error.message || "Не удалось сохранить профиль.");
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
      setError(error.message || "Не удалось открыть чат.");
    } finally {
      setBusy(false);
    }
  };

  const startEditing = (field, value) => {
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
    const departmentName = departments.data?.find((department) => department.id === value)?.name
      || (value === profile.data.department ? profile.data.departmentName : "")
      || "Не указан";
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
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
          ) : (
            <input
              type={field === "birthDate" ? "date" : field === "email" ? "email" : "text"}
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
          <span className="profile__value">{isDepartment ? departmentName : value || "Не указано"}</span>
        )}
        {isCurrentUser && !isEditing && (
          <button
            type="button"
            className="profile__edit-icon"
            onClick={() => startEditing(field, value)}
            title="Редактировать"
            aria-label={`Редактировать: ${label}`}
            disabled={busy || (isDepartment && departments.loading)}
          >✏️</button>
        )}
      </div>
    );
  };

  if (!currentUser) return <div className="profile-error">Вы не авторизованы</div>;
  if (profile.loading) return <div className="profile-error">Загрузка профиля…</div>;
  if (!profileUser) {
    return (
      <div className="profile-error">
        <h2>{profile.error || "Пользователь не найден"}</h2>
        <Link to="/">Вернуться на главную</Link>
      </div>
    );
  }

  return (
    <div className="profile">
      <div className="profile__header">
        <div className="profile__avatar">
          <div className="profile__avatar-placeholder" style={{ background: getUserColor(profileUser) }}>
            {profileUser.name?.charAt(0) || "П"}{profileUser.lastname?.charAt(0) || ""}
          </div>
        </div>
        <h1>{profileUser.name} {profileUser.lastname}</h1>
        <p className="profile__bio">{profileUser.bio || "Нет описания"}</p>
      </div>

      {error && <p role="alert">{error}</p>}
      {profile.error && <p role="alert">{profile.error}</p>}
      {departments.error && <p role="alert">{departments.error}</p>}
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
          <button className="profile__save-all-btn" disabled={busy} onClick={handleSaveAll}>
            <img src={save} alt="Сохранить" className="header__menu-link-image" />
            Сохранить все изменения
          </button>
          <button className="profile__logout-btn" disabled={busy} onClick={handleLogout}>
            <img src={logout_image} alt="Выйти" className="header__menu-link-image" />
            Выйти из аккаунта
          </button>
        </div>
      ) : (
        <div className="profile__actions">
          <button className="profile__send-message-btn" disabled={busy} onClick={() => handleMessage(profileUser.id)}>
            Перейти в чат
          </button>
          <button className={`profile__follow-btn ${isFollowing ? "following" : ""}`} disabled title="Подписки пока недоступны">
            {isFollowing ? "Отписаться" : "Подписаться"}
          </button>
        </div>
      )}

      <div className="profile__posts-list">
        {posts.filter((post) => String(post.userId) === String(profileUser.id)).map((post) => (
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
