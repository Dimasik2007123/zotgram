import notificationUrl from "../public/notification.mp3";

let lastPlayedAt = 0;

export function playNotificationSound() {
  const now = Date.now();

  // Не чаще одного раза в 1 секунду
  if (now - lastPlayedAt < 1000) return;
  lastPlayedAt = now;

  const audio = new Audio(notificationUrl);
  audio.volume = 1;

  audio.play().catch(() => {
    // Браузер может запрещать воспроизведение
  });
}
