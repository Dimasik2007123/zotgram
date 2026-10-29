import { useParams } from "react-router-dom";
import { api } from "../api/client";
import { useQuery } from "../api/hooks";
import Post from "../components/Post";

function PostPage() {
  const { postId } = useParams();

  const { data, loading, error, reload } = useQuery(
    async () => {
      try {
        return await api(`/api/core/posts/${postId}/`);
      } catch (error) {
        if (error.status === 404) {
          throw new Error("Пост не найден", { cause: error });
        }
        throw error;
      }
    },
    `post:${postId}`,
    "posts",
  );

  if (loading) {
    return (
      <div className="status-message status-message--page" role="status">
        Загрузка
      </div>
    );
  }

  if (error) {
    return (
      <div className="status-message status-message--page" role="alert">
        <p className="status-message__text">{error}</p>
        <button
          type="button"
          className="status-message__action"
          onClick={reload}
        >
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="feed">
      <Post key={data.id} post={data} />
    </div>
  );
}

export default PostPage;
