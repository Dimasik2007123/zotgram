import json
import secrets
import time
from django.conf import settings
from redis import Redis
from redis.exceptions import RedisError
from rest_framework.exceptions import APIException

class TicketsUnavailable(APIException):
    status_code = 503
    default_detail = "Соединение временно недоступно. Повторите позже."

def storage():
    return Redis.from_url(
        settings.REDIS_URL, decode_responses=True, socket_connect_timeout=2,
        socket_timeout=2)

def issue(user_id, access_exp, authorization=''):
    ttl = min(30, int(access_exp - time.time()))
    if ttl <= 0:
        raise TicketsUnavailable("Обновите авторизацию.")
    ticket = secrets.token_urlsafe(32)
    try:
        storage().setex('zotgram:ticket:' + ticket, ttl,
                        json.dumps({'user_id': str(user_id), 'exp': access_exp, 'authorization': authorization}))
    except RedisError:
        raise TicketsUnavailable()
    return ticket

def consume(ticket):
    if not isinstance(ticket, str) or len(ticket) > 100:
        return None
    raw = storage().getdel("zotgram:ticket:" + ticket)
    if not raw:
        return None
    data = json.loads(raw)
    return data if data["exp"] > time.time() else None
