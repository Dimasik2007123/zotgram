import { useParams, Link } from "react-router";
import { users } from "../users";
import { useState, useMemo } from "react";
import posts from "../posts";
import Post from "../components/Post";

import save from "../assets/images/save.svg";
import logout from "../assets/images/logout.svg";

import getUserColor from "../utils/getUserColor";

function Profile() {
  const { userId } = useParams();
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  const isCurrentUser = String(userId) === String(currentUser.id);

  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState("");

  const profileUser = useMemo(
    () => users.find((user) => String(user.id) === String(userId)) || null,
    [userId],
  );

  const [isFollowing, setIsFollowing] = useState(() => {
    if (!profileUser) return false;
    const currentUserData = users.find(
      (u) => String(u.id) === String(currentUser.id),
    );
    return currentUserData?.following?.includes(profileUser.id) || false;
  });

  if (!profileUser) {
    return (
      <div className="profile-error">
        <h2>Пользователь не найден</h2>
        <Link to="/">Вернуться на главную</Link>
      </div>
    );
  }

  if (!currentUser) {
    return <div className="profile-error">Вы не авторизованы</div>;
  }

  const handleFollowToggle = () => {
    /*const currentUserIndex = users.findIndex(
      (u) => String(u.id) === String(currentUser.id),
    );
    const profileUserIndex = users.findIndex(
      (u) => String(u.id) === String(userId),
    );

    if (currentUserIndex === -1 || profileUserIndex === -1) return;

    const updatedUsers = [...users];
    const currentUserData = updatedUsers[currentUserIndex];
    const profileUserData = updatedUsers[profileUserIndex];

    if (isFollowing) {
      currentUserData.following = currentUserData.following.filter(
        (id) => String(id) !== String(userId),
      );
      profileUserData.followers = profileUserData.followers.filter(
        (id) => String(id) !== String(currentUser.id),
      );
    } else {
      // Подписываемся
      if (!currentUserData.following) currentUserData.following = [];
      if (!profileUserData.followers) profileUserData.followers = [];
      currentUserData.following.push(profileUserData.id);
      profileUserData.followers.push(currentUserData.id);
    }

    // Обновляем users
    users[currentUserIndex] = currentUserData;
    users[profileUserIndex] = profileUserData;
  */
    // Обновляем состояние
    setIsFollowing(!isFollowing);
  };

  const handleSave = (field, value) => {
    if (!value.trim()) return;

    /*const updatedUser = { ...profileUser, [field]: value };*/

    // Обновляем в массиве users
    /*const userIndex = users.findIndex((u) => String(u.id) === String(userId));
    if (userIndex !== -1) {
      users[userIndex] = updatedUser;
    }*/

    if (isCurrentUser) {
      const localUser = JSON.parse(localStorage.getItem("user") || "{}");
      const updatedLocalUser = { ...localUser, [field]: value };
      localStorage.setItem("user", JSON.stringify(updatedLocalUser));
    }

    setEditingField(null);
    setEditValue("");
    location.reload();
  };

  const startEditing = (field, value) => {
    setEditingField(field);
    setEditValue(value || "");
  };

  const handleKeyDown = (e, field) => {
    if (e.key === "Enter") {
      handleSave(field, editValue);
    }
    if (e.key === "Escape") {
      setEditingField(null);
      setEditValue("");
    }
  };

  const renderField = (label, field, value) => {
    if (!isCurrentUser && label === "О себе") return;
    const isEditing = editingField === field;

    return (
      <div className="profile__field">
        <strong>{label}:</strong>
        {isEditing ? (
          <input
            type="text"
            className="profile__input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => handleSave(field, editValue)}
            onKeyDown={(e) => handleKeyDown(e, field)}
            autoFocus
          />
        ) : (
          <span className="profile__value">{value || "Не указано"}</span>
        )}
        {isCurrentUser && !isEditing && (
          <button
            className="profile__edit-icon"
            onClick={() => startEditing(field, value)}
            title="Редактировать"
          >
            ✏️
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="profile">
      <div className="profile__header">
        <div className="profile__avatar">
          <div
            className="profile__avatar-placeholder"
            style={{ background: getUserColor(profileUser.id) }}
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

      <div className="profile__info">
        {renderField("Имя", "name", profileUser.name)}
        {renderField("Фамилия", "lastname", profileUser.lastname)}
        {renderField("Email", "email", profileUser.email)}
        {renderField("Телефон", "phone", profileUser.phone)}
        {renderField("Дата рождения", "birthDate", profileUser.birthDate)}
        {renderField("О себе", "bio", profileUser.bio)}
      </div>

      {isCurrentUser ? (
        <div className="profile__actions">
          <button
            className="profile__save-all-btn"
            onClick={() => alert("Все данные сохранены в localStorage")}
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
            onClick={() => {
              localStorage.removeItem("user");
              localStorage.removeItem("yandex_token");
              window.location.href = "/login";
            }}
          >
            <img src={logout} alt="Выйти" className="header__menu-link-image" />
            Выйти из аккаунта
          </button>
        </div>
      ) : (
        <button
          className={`profile__follow-btn ${isFollowing ? "following" : ""}`}
          onClick={handleFollowToggle}
        >
          {isFollowing ? "Отписаться" : "Подписаться"}
        </button>
      )}

      <div className="profile__posts-list">
        {posts
          .filter((post) => String(post.userId) === String(profileUser.id))
          .map((post) => (
            <Post key={post.id} post={post} showActivity={!isCurrentUser} />
          ))}
      </div>
    </div>
  );
}

export default Profile;
