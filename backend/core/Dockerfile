FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd --create-home app && mkdir -p /app/media /app/staticfiles /run/zotgramkeys && chown -R app:app /app
USER app
CMD ["python", "-m", "daphne", "-b", "0.0.0.0", "-p", "8000", "core_config.asgi:application"]