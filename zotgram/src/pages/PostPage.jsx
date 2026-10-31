import { useParams } from "react-router-dom";
import { usePost } from "../api/hooks";
import Post from "../components/Post";

function PostPage() {
  const { postId } = useParams();

  const { data, loading, error, reload } = usePost(postId);

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
