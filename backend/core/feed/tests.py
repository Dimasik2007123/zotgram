from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient
from urllib.parse import urlsplit
from accounts.models import Department, Follow, User
from .models import Post, Comment, Like


class ListQueryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        department = Department.objects.create(id="testing", name="Testing")
        cls.owner = User.objects.create(username="owner", department=department, is_superuser=True)
        cls.authors = [User.objects.create(username=f"author-{index}", first_name=f"Author {index:02}",
                                           department=department) for index in range(25)]
        cls.posts = [Post.objects.create(author=author, text=f"Post {index}")
                     for index, author in enumerate(cls.authors)]
        Follow.objects.bulk_create([Follow(follower=cls.owner, author=author) for author in cls.authors])
        Like.objects.bulk_create([Like(post=post, user=cls.owner) for post in cls.posts])
        Comment.objects.bulk_create([Comment(post=cls.posts[0], author=author, text=f"Comment {index}")
                                     for index, author in enumerate(cls.authors)])

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)

    def query_count(self, path, size):
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get(path, {"page_size": size})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), size)
        return len(queries)

    def test_post_list_queries_are_bounded(self):
        small = self.query_count("/api/core/posts/", 1)
        large = self.query_count("/api/core/posts/", 20)
        print(f"POSTS SQL: 1 item={small}, 20 items={large}")
        self.assertLessEqual(large, small + 1)

    def test_directory_queries_are_bounded(self):
        small = self.query_count("/api/core/users/", 1)
        large = self.query_count("/api/core/users/", 20)
        print(f"USERS SQL: 1 item={small}, 20 items={large}")
        self.assertLessEqual(large, small + 1)

    def test_comment_queries_are_bounded(self):
        path = f"/api/core/posts/{self.posts[0].pk}/comments/"
        small = self.query_count(path, 1)
        large = self.query_count(path, 20)
        print(f"COMMENTS SQL: 1 item={small}, 20 items={large}")
        self.assertLessEqual(large, small + 1)

    def test_stats_and_author_relationships_remain_correct(self):
        response = self.client.get(f"/api/core/posts/{self.posts[0].pk}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['likesCount'], 1)
        self.assertEqual(response.data['commentsCount'], 25)
        self.assertTrue(response.data['isLiked'])
        self.assertEqual(response.data['author']['departmentName'], 'Testing')
        self.assertIn(str(self.owner.pk), response.data['author']['followers'])
        other = self.client.get(f"/api/core/posts/{self.posts[1].pk}/")
        self.assertEqual(other.data['commentsCount'], 0)

    def test_like_responses_use_counts_after_the_mutation(self):
        path = f"/api/core/posts/{self.posts[0].pk}/like/"
        removed = self.client.delete(path)
        self.assertEqual(removed.data['likesCount'], 0)
        self.assertFalse(removed.data['isLiked'])
        added = self.client.put(path)
        self.assertEqual(added.data['likesCount'], 1)
        self.assertTrue(added.data['isLiked'])

    def test_comments_load_latest_first_and_cursor_survives_new_comments(self):
        path = f"/api/core/posts/{self.posts[0].pk}/comments/"
        first = self.client.get(path)
        self.assertEqual(len(first.data['results']), 20)
        self.assertTrue(first.data['next'])
        dates = [row['date'] for row in first.data['results']]
        self.assertEqual(dates, sorted(dates, reverse=True))
        created = self.client.post(path, {'text': 'New comment'}, format='json')
        self.assertEqual(created.status_code, 201)
        cursor = urlsplit(first.data['next'])
        second = self.client.get(cursor.path + '?' + cursor.query)
        self.assertEqual(second.status_code, 200)
        old_ids = {str(comment.pk) for comment in Comment.objects.filter(post=self.posts[0]).exclude(pk=created.data['id'])}
        received = {row['id'] for row in first.data['results'] + second.data['results']}
        self.assertEqual(received, old_ids)
        latest = self.client.get(path)
        self.assertEqual(latest.data['results'][0]['id'], created.data['id'])

    def test_directory_and_posts_return_only_one_page(self):
        for path in ['/api/core/users/', '/api/core/posts/']:
            first = self.client.get(path)
            self.assertEqual(len(first.data['results']), 20)
            cursor = urlsplit(first.data['next'])
            second = self.client.get(cursor.path + '?' + cursor.query)
            self.assertEqual(len(second.data['results']), 5)
            self.assertIsNone(second.data['next'])
