export const getUserColor = (user, defaultColor = "#4A6CF7") => {
  return user?.avatarColor || defaultColor;
};

export default getUserColor;
