import { useSearchParams } from "react-router-dom";
import { useQuery } from "../api/hooks";
import { allPages } from "../api/client";
import Post from "../components/Post";

function Feed() {
  const [params] = useSearchParams();
  const key = params.toString();
  const { data, loading, error, reload } = useQuery(
    () => allPages(`/api/core/posts/?${key}`),
    key,
    "posts",
  );

  if (loading) {
    return <div className="status-message status-message--page" role="status">Загрузка</div>;
  }

  if (error)
    return (
      <div className="status-message status-message--page" role="alert">
        <p className="status-message__text">{error}</p>
        <button type="button" className="status-message__action" onClick={reload}>
          Повторить
        </button>
      </div>
    );

  return (
    <div className={`feed${data.length ? "" : " feed--empty"}`}>
      {data.length ? (
        data.map((post) => <Post key={post.id} post={post} />)
      ) : (
        <p className="status-message">Публикаций пока нет</p>
      )}
    </div>
  );
}

export default Feed;
