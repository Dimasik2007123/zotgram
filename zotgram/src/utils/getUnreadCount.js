import messages from "../messages";

export const getUnreadCount = (chatId, userId) => {
  const chatMessages = messages.filter((m) => m.chatId === chatId);
  return chatMessages.filter(
    (m) => m.authorId !== userId && !m.readBy.includes(userId),
  ).length;
};

export default getUnreadCount;

export const getTotalUnreadCounts = (userId) => {
  const chatIds = [...new Set(messages.map((m) => m.chatId))];

  return chatIds.reduce((total, chatId) => {
    return total + getUnreadCount(chatId, userId);
  }, 0);
};
