import { useState, useEffect } from "react";

import posts from "../posts.js";
import users from "../users.js";

import Post from "../components/Post";

function Feed() {
  const [postsData, setPostsData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPosts = () => {
      const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

      if (!currentUser.id) {
        setPostsData(posts);
        setLoading(false);
        return;
      }

      const user = users.find((u) => String(u.id) === String(currentUser.id));

      if (!user || !user.following || user.following.length === 0) {
        setPostsData(posts);
        setLoading(false);
        return;
      }

      const followingPosts = [];
      const otherPosts = [];

      posts.forEach((post) => {
        if (user.following.some((id) => String(id) === String(post.userId))) {
          followingPosts.push(post);
        } else if (user.id !== post.userId) {
          otherPosts.push(post);
        }
      });

      setPostsData([...followingPosts, ...otherPosts]);
      setLoading(false);
    };

    fetchPosts();
  }, []);

  if (loading) {
    return <div className="feed-loading">Загрузка...</div>;
  }

  return (
    <div className="feed">
      {postsData.map((post) => (
        <Post key={post.id} post={post} />
      ))}
    </div>
  );
}

export default Feed;
