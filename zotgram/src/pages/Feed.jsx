import { useSearchParams } from "react-router-dom";
import { usePosts } from "../api/hooks";
import Post from "../components/Post";
import LoadMore from "../components/LoadMore";

function Feed() {
  const [params] = useSearchParams();
  const key = params.toString();
  const posts = usePosts(key);
  const { data, loading, error, reload } = posts;

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
      <LoadMore state={posts} />
    </div>
  );
}

export default Feed;
