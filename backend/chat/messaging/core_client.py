import atexit

import httpx

# Один пул соединений на процесс. Заголовок пользователя передаём в каждом запросе.
# Внутренние обращения к Core не должны идти через системный HTTP-прокси.
core_client = httpx.Client(timeout=5, trust_env=False)
atexit.register(core_client.close)
