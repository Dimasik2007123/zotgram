# ZotGram

Внутренняя соцсеть с профилями сотрудников, постами, лайками, комментариями, личными и групповыми чатами. Вход через Яндекс ID, сообщения доставляются через WebSocket. Поддерживаются файлы до 30 МБ и уведомления при открытой вкладке.

Бэкенд разделён на два сервиса: **Core** отвечает за пользователей и публикации, **Chat** — за переписки.

Сайт доступен по адресу **https://zotgram.fxtun.ru**

## Технологии

- React 19, Redux Toolkit (включая RTK Query), React Router 7, Vite 8, JavaScript, CSS
- Python, Django 5.2, Django REST Framework, Simple JWT
- Django Channels, Daphne, WebSocket, Яндекс OAuth
- PostgreSQL 17, Redis 7
- Docker Compose, Nginx

## Оптимизация

- Добавлены общий кэш данных, аватаров и вложений, объединение одинаковых запросов и пакетная загрузка списков.
- История чатов загружается частями и дополняется только недостающими сообщениями; поиск выполняется с задержкой на сервере.
- Новые сообщения, лайки и комментарии сразу обновляют интерфейс через WebSocket и оптимистичные изменения с безопасным повтором.
- Уменьшены запросы к базе данных и лишние перерисовки React-компонентов; документы скачиваются только по нажатию.
- Кэш живёт в памяти вкладки, очищается при выходе и перезагрузке. Подробности — в [документе об оптимизации](docs/ZotGram_оптимизация_сайта.txt).

## Подготовка

Все команды ниже выполняются **из корня репозитория в PowerShell**. Для локальной разработки нужны Python 3.11+, Node.js 22 и Docker Desktop. Для полностью контейнерного запуска достаточно Docker и подготовленных настроек/ключей.

1. Создай `backend/core/.env` и `backend/chat/.env` по соответствующим `.env.example`, если их ещё нет. Укажи разные `DJANGO_SECRET_KEY`, а в Core — `YANDEX_CLIENT_ID` и `YANDEX_CLIENT_SECRET`.
2. В настройках OAuth-приложения Яндекса добавь Redirect URI:
   - `http://localhost:3000/auth/callback` — локальная разработка
   - `http://localhost:8080/auth/callback` — Docker
3. Подготовь RSA-ключи `backend/keys/core-private.pem` и `backend/keys/core-public.pem`. Если ключей ещё нет, сгенерируй их через установленный OpenSSL:

```powershell
New-Item -ItemType Directory -Force backend/keys | Out-Null
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out backend/keys/core-private.pem
openssl pkey -in backend/keys/core-private.pem -pubout -out backend/keys/core-public.pem
```

Существующие ключи используй повторно. `.env` и ключи исключены из Git.

## Локальная разработка

PostgreSQL и Redis работают в Docker, Django и Vite запускаются на компьютере.

Установка зависимостей, один раз:

```powershell
python -m venv backend/core/.venv
python -m venv backend/chat/.venv
.\backend\core\.venv\Scripts\python.exe -m pip install -r backend/core/requirements.txt
.\backend\chat\.venv\Scripts\python.exe -m pip install -r backend/chat/requirements.txt
npm.cmd --prefix zotgram ci
```

Первый запуск баз и создание начальных данных:

```powershell
docker compose up -d --wait
.\backend\core\.venv\Scripts\python.exe backend/core/manage.py migrate
.\backend\chat\.venv\Scripts\python.exe backend/chat/manage.py migrate
.\backend\core\.venv\Scripts\python.exe backend/core/manage.py seed_departments
.\backend\chat\.venv\Scripts\python.exe backend/chat/manage.py seed_system_chats
.\backend\core\.venv\Scripts\python.exe backend/core/manage.py createsuperuser
```

При следующих запусках достаточно поднять базы через `docker compose up -d --wait` и выполнить команды ниже **в трёх отдельных терминалах**:

```powershell
.\backend\core\.venv\Scripts\python.exe backend/core/manage.py runserver 127.0.0.1:8000
```

```powershell
.\backend\chat\.venv\Scripts\python.exe backend/chat/manage.py runserver 127.0.0.1:8001
```

```powershell
npm.cmd --prefix zotgram run dev
```

Сайт: **http://localhost:3000**. Остановка Django и Vite — `Ctrl+C` в каждом терминале, баз и Redis — `docker compose stop`.

## Полностью в Docker

Этот режим использует отдельные базы и тома. Данные локальной разработки автоматически сюда не переносятся. Адреса сервисов и callback для порта 8080 переопределяются в `compose.full.yaml`.

Первый запуск:

```powershell
docker compose -f compose.full.yaml build
docker compose -f compose.full.yaml up -d --wait core-db chat-db redis
docker compose -f compose.full.yaml run --rm core python manage.py migrate
docker compose -f compose.full.yaml run --rm chat python manage.py migrate
docker compose -f compose.full.yaml run --rm core python manage.py seed_departments
docker compose -f compose.full.yaml run --rm chat python manage.py seed_system_chats
docker compose -f compose.full.yaml run --rm core python manage.py createsuperuser
docker compose -f compose.full.yaml up -d --wait
```

Сайт: **http://localhost:8080**, админка: **http://localhost:8080/admin/**.

Повторный запуск:

```powershell
docker compose -f compose.full.yaml up -d --wait
```

Остановка с сохранением данных:

```powershell
docker compose -f compose.full.yaml stop
```

Обновление после изменений кода:

```powershell
docker compose -f compose.full.yaml build
docker compose -f compose.full.yaml up -d --wait
docker compose -f compose.full.yaml exec nginx nginx -s reload
```

Если появились новые миграции, после сборки и перед запуском примени их командами `run --rm ... migrate` из первого запуска. Файлы миграций должны быть созданы в исходниках до сборки. После обновления фронта обнови страницу через `Ctrl+F5`.

После обновления оптимизации Core дополнительно примени миграции:

```powershell
docker compose -f compose.full.yaml run --rm core python manage.py migrate
```

Состояние и журналы:

```powershell
docker compose -f compose.full.yaml ps
docker compose -f compose.full.yaml logs --tail=100 core chat nginx
```

`compose.full.yaml` настроен для локального HTTP-запуска. Для публичного сервера нужны домен, HTTPS и собственные пароли и секреты.

## Админки

У сервисов отдельные админки и учётные записи:

- Core: `/admin/` — пользователи, отделы, публикации
- Chat: `/admin/chat/` — чаты, участники и сообщения

В Docker открывай эти пути на `http://localhost:8080`, при локальной разработке через Vite — на `http://localhost:3000`. Напрямую админка Chat доступна на `http://localhost:8001/admin/chat/`.

Для входа в Chat один раз создай его суперпользователя (логин и пароль из Core автоматически не переносятся).

В Docker:

```powershell
docker compose -f compose.full.yaml exec chat python manage.py createsuperuser
```

При локальной разработке:

```powershell
.\backend\chat\.venv\Scripts\python.exe backend/chat/manage.py createsuperuser
```
