from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4
from urllib.parse import urlsplit
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient
from .models import Chat, Membership, Message


class ChatQueryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner_id, cls.other_id = uuid4(), uuid4()
        cls.chats = [Chat.objects.create(type="group", name=f"Chat {index}", last_sequence=25)
                     for index in range(25)]
        Membership.objects.bulk_create([Membership(chat=chat, user_id=user_id)
                                       for chat in cls.chats for user_id in [cls.owner_id, cls.other_id]])
        Message.objects.bulk_create([Message(chat=chat, author_id=cls.other_id, sequence=sequence,
                                            attempt_id=uuid4(), text="Message")
                                    for chat in cls.chats for sequence in range(1, 26)])

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=SimpleNamespace(id=self.owner_id, pk=self.owner_id, is_authenticated=True))

    def query_count(self, path, size):
        with patch("messaging.views.sync_system_memberships"), \
             patch("messaging.views.visible_chats", return_value=Chat.objects.all()), \
             CaptureQueriesContext(connection) as queries:
            response = self.client.get(path, {"page_size": size})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), size)
        return len(queries)

    def test_chat_list_queries_are_bounded(self):
        small = self.query_count("/api/chat/chats/", 1)
        large = self.query_count("/api/chat/chats/", 20)
        print(f"CHATS SQL: 1 item={small}, 20 items={large}")
        self.assertLessEqual(large, small + 1)

    def test_message_history_has_no_query_per_message(self):
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get(f"/api/chat/chats/{self.chats[0].pk}/messages/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 25)
        print(f"MESSAGES SQL: 25 items={len(queries)}")
        self.assertLessEqual(len(queries), 3)

    def test_prepared_chats_preserve_members_messages_and_counts(self):
        Membership.objects.filter(chat=self.chats[0], user_id=self.owner_id).update(last_read_sequence=20)
        Message.objects.create(chat=self.chats[0], author_id=self.owner_id, sequence=26, attempt_id=uuid4(), text='Own')
        Chat.objects.filter(pk=self.chats[0].pk).update(last_sequence=26)
        with patch('messaging.views.sync_system_memberships'), patch('messaging.views.visible_chats', return_value=Chat.objects.all()):
            response = self.client.get('/api/chat/chats/', {'page_size': 100})
        row = next(row for row in response.data['results'] if row['id'] == str(self.chats[0].pk))
        self.assertEqual(row['unreadCount'], 5)
        self.assertEqual(row['lastMessage']['sequence'], 26)
        self.assertEqual(row['lastMessage']['chatId'], str(self.chats[0].pk))
        self.assertEqual(set(row['participants']), {str(self.owner_id), str(self.other_id)})
        self.assertEqual(row['lastReadSequence'], 20)

    def test_cursor_does_not_resync_memberships_and_handles_deleted_rows(self):
        with patch('messaging.views.sync_system_memberships') as sync, \
             patch('messaging.views.visible_chats', side_effect=lambda request: Chat.objects.all()):
            first = self.client.get('/api/chat/chats/', {'sync': 1})
            self.assertEqual(len(first.data['results']), 20)
            removed_id = first.data['results'][0]['id']
            Chat.objects.filter(pk=removed_id).delete()
            cursor = urlsplit(first.data['next'])
            second = self.client.get(cursor.path + '?' + cursor.query)
            self.assertEqual(second.status_code, 200)
            self.assertEqual(len(second.data['results']), 5)
            self.assertIsNone(second.data['next'])
            self.assertEqual(sync.call_count, 1)
        ids = [row['id'] for row in first.data['results'] + second.data['results']]
        self.assertEqual(len(set(ids)), 25)

    def test_unread_summary_includes_chats_outside_the_first_page(self):
        with patch('messaging.views.visible_chats', return_value=Chat.objects.all()), CaptureQueriesContext(connection) as queries:
            response = self.client.get('/api/chat/unread/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['chats']), 25)
        self.assertEqual(response.data['totalUnread'], 625)
        self.assertLessEqual(len(queries), 2)

    def test_permissions_and_system_links_are_checked_on_each_request(self):
        for key in ['general', 'frontend', 'backend']:
            room = Chat.objects.create(type='group', name=key, system_key=key,
                                       department_id='' if key == 'general' else key)
            Membership.objects.create(chat=room, user_id=self.owner_id)
        with patch('messaging.system_chats.core_profile', return_value={'id': str(self.owner_id), 'department': 'frontend'}) as profile:
            summary = self.client.get('/api/chat/unread/')
            keys = {row['systemKey'] for row in summary.data['systemChats']}
            self.assertEqual(keys, {'general', 'frontend'})
            profile.return_value = {'id': str(self.owner_id), 'department': 'backend'}
            changed = self.client.get('/api/chat/unread/')
            keys = {row['systemKey'] for row in changed.data['systemChats']}
            self.assertEqual(keys, {'general', 'backend'})
            self.assertEqual(profile.call_count, 2)
