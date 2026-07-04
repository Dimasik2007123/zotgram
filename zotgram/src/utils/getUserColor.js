import { users } from "../users";

export const getUserColor = (userId, defaultColor = "#4A6CF7") => {
  if (!userId) return defaultColor;

  // Ищем пользователя в массиве users
  const user = users.find((u) => String(u.id) === String(userId));

  // Если нашли и есть avatarColor — возвращаем его
  if (user?.avatarColor) return user.avatarColor;

  // Если не нашли или нет цвета — возвращаем цвет по умолчанию
  return defaultColor;
};

export default getUserColor;
