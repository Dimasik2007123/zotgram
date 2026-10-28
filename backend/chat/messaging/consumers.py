import asyncio
import json
import time
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from asgiref.sync import sync_to_async
from redis.exceptions import RedisError
from .models import Membership
from .tickets import consume


class ChatConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.user_id = None
        self.expires_at = 0
        self.group = None
        await self.accept()
        self.timeout_task = asyncio.create_task(self.expire(5))

    async def expire(self, seconds):
        await asyncio.sleep(max(0, seconds))
        await self.close(code=4401)

    async def receive(self, text_data=None, bytes_data=None, **kwargs):
        if bytes_data is not None or text_data is None or len(text_data) > 4096:
            await self.close(code=1009)
            return
        try:
            data = json.loads(text_data)
            if not isinstance(data, dict):
                raise ValueError()
        except ValueError:
            await self.close(code=1007)
            return
        if self.user_id is None:
            try:
                auth = await sync_to_async(consume)(data.get("ticket")) if data.get("type") == "auth" else None
            except RedisError:
                await self.close(code=1013)
                return
            if not auth:
                await self.close(code=4401)
                return
            self.timeout_task.cancel()
            self.user_id, self.expires_at = auth["user_id"], auth["exp"]
            self.group = f"user.{self.user_id}"
            await self.channel_layer.group_add(self.group, self.channel_name)
            self.timeout_task = asyncio.create_task(
                self.expire(self.expires_at - time.time()))
            await self.send_json({"type": "auth.ready"})
        elif time.time() >= self.expires_at:
            await self.close(code=4401)
        elif data.get("type") == "ping":
            await self.send_json({"type": "pong"})

    async def notify(self, event):
        if not self.user_id or time.time() >= self.expires_at:
            await self.close(code=4401)
            return
        payload = event["event"]
        if payload["type"] != "chat.removed":
            allowed = await database_sync_to_async(Membership.objects.filter(
                chat_id=payload["chat_id"], user_id=self.user_id).exists)()
            if not allowed:
                return
        await self.send_json(payload)

    async def disconnect(self, code):
        task = getattr(self, "timeout_task", None)
        if task:
            task.cancel()
        if self.group:
            await self.channel_layer.group_discard(self.group, self.channel_name)
