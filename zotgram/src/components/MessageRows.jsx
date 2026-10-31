import { memo, useMemo } from "react";
import ChatMessage from "./ChatMessage";

function MessageRows({ rows, people, user, readThrough, onImageLoad }) {
  const authors = useMemo(() => new Map(people.map((person) => [String(person.id), person])), [people]);
  return rows.map((message) => {
    const own = String(message.authorId) === String(user.id);
    return <ChatMessage key={message.attempt_id ? `${message.authorId}:${message.attempt_id}` : message.id}
      message={message} author={own ? user : authors.get(String(message.authorId))} own={own}
      read={own && !message.delivery && readThrough >= message.sequence} onImageLoad={onImageLoad} />;
  });
}

export default memo(MessageRows);
