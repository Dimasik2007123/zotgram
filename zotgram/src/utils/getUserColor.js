import { users } from "../users";

export const getUserColor = (userId, defaultColor = "#4A6CF7") => {
  if (!userId) return defaultColor;

  const user = users.find((u) => String(u.id) === String(userId));

  if (user?.avatarColor) return user.avatarColor;

  return defaultColor;
};

export default getUserColor;
