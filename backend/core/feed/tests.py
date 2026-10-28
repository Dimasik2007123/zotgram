from django.test import TestCase
from rest_framework.test import APIClient
from accounts.models import Follow, User
from .models import Post


class FeedVisibilityTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="viewer")
        self.followed = User.objects.create_user(username="followed")
        self.other = User.objects.create_user(username="other")
        Follow.objects.create(follower=self.user, author=self.followed)
        self.followed_post = Post.objects.create(author=self.followed, text="followed")
        Post.objects.create(author=self.other, text="other")
        Post.objects.create(author=self.user, text="own-only-search")
        self.api = APIClient()
        self.api.force_authenticate(self.user)

    def test_feed_excludes_own_posts_before_pagination(self):
        first = self.api.get("/api/core/posts/?page_size=1")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data["count"], 2)
        self.assertEqual(first.data["results"][0]["id"], str(self.followed_post.id))
        self.assertIsNotNone(first.data["next"])
        second = self.api.get("/api/core/posts/?page_size=1&page=2")
        self.assertEqual(second.data["results"][0]["userId"], str(self.other.id))
        self.assertIsNone(second.data["next"])
        searched = self.api.get("/api/core/posts/?q=own-only-search")
        self.assertEqual(searched.data["count"], 0)

    def test_profile_requests_include_only_requested_authors_posts(self):
        own = self.api.get(f"/api/core/posts/?author={self.user.id}")
        self.assertEqual(own.data["count"], 1)
        self.assertEqual(own.data["results"][0]["userId"], str(self.user.id))
        other = self.api.get(f"/api/core/posts/?author={self.other.id}")
        self.assertEqual(other.data["count"], 1)
        self.assertEqual(other.data["results"][0]["userId"], str(self.other.id))

    def test_created_post_is_visible_in_profile_and_in_other_users_feed(self):
        created = self.api.post("/api/core/posts/", {"text": "new-own-post"}, format="json")
        self.assertEqual(created.status_code, 201)
        self.assertEqual(self.api.get("/api/core/posts/").data["count"], 2)
        own = self.api.get(f"/api/core/posts/?author={self.user.id}").data
        self.assertIn(created.data["id"], [row["id"] for row in own["results"]])
        self.api.force_authenticate(self.other)
        others_feed = self.api.get("/api/core/posts/").data
        self.assertIn(created.data["id"], [row["id"] for row in others_feed["results"]])
