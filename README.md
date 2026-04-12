# Varya Nails

Telegram Mini App для мастера ногтевого сервиса. Первый инкремент фиксирует главный рабочий сценарий: клиент оставляет подробную заявку, мастер вручную подтверждает, уточняет или переносит запись.

## Уже есть

- Форма заявки клиента с телефоном, Telegram/VK, процедурой, длиной, описанием работы, фото рук, референсом и выбранным окошком.
- Расчет примерной длительности по процедуре, длине и ключевым деталям.
- Рабочее место мастера с карточками заявок.
- Статусы: новая, нужны уточнения, ждет клиента, подтверждена, отклонена.
- Отдельная зона календаря для подтвержденных записей.

## Следующие слои

- Реальная загрузка фото вместо имени файла.
- Настройка услуг, длительности и окошек мастером.
- Перетаскивание записей в календаре.
- API + база данных для заявок, клиентов и расписания.
- Telegram Bot API: уведомления мастеру и клиенту.
- Проверка Telegram Mini App initData на сервере.

## Backend

По умолчанию backend может работать без Docker и PostgreSQL через локальный JSON-файл:

```bash
cp .env.example .env
npm run dev:api
```

Затем заполнить начальными данными:

```bash
curl -X POST http://127.0.0.1:4000/api/bootstrap
```

Данные сохраняются в `server/.data/dev-db.json`.

Для PostgreSQL нужно поменять `.env`:

```env
STORAGE_DRIVER=postgres
```

Локальная база поднимается через Docker:

```bash
docker compose up -d postgres
```

API запускается отдельно:

```bash
cp .env.example .env
npm run dev:api
```

Для локального доступа к админке без Telegram можно оставить:

```env
ALLOW_DEV_AUTH=true
MASTER_TELEGRAM_IDS=
```

Для проверки через конкретный dev-id:

```env
ALLOW_DEV_AUTH=true
MASTER_TELEGRAM_IDS=123456
VITE_DEV_TELEGRAM_ID=123456
```

В продакшене нужно указать:

```env
TELEGRAM_BOT_TOKEN=...
MASTER_TELEGRAM_IDS=telegram_id_мастера
ALLOW_DEV_AUTH=false
```

## Деплой на Render

В репозитории уже есть `render.yaml`. Для деплоя:

1. Создай новый Render Blueprint из этого репозитория.
2. В сервисе `varyanails-api` добавь переменную `TELEGRAM_BOT_TOKEN` вручную.
3. Убедись, что `MASTER_TELEGRAM_IDS=872647068`.
4. API сам загрузит стартовые данные при первом запуске (idempotent seed).

5. В @BotFather укажи Web App URL:
`https://varyanails-web.onrender.com`

После первого старта можно заполнить базу начальными данными:

```bash
curl -X POST http://127.0.0.1:4000/api/bootstrap
```

Основной снимок данных:

```bash
curl http://127.0.0.1:4000/api/snapshot
```
