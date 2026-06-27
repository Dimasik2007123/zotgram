import posts from "../posts.js";

import Post from "../components/Post";

function Feed() {
  return (
    <div className="feed">
      {posts.map((post) => (
        <Post key={post.id} post={post} />
      ))}
    </div>
  );
}

export default Feed;
