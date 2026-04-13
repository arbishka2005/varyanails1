import "dotenv/config";

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "postgres://varyanails:varyanails@localhost:5432/varyanails",
  storageDriver: process.env.STORAGE_DRIVER ?? "file",
  fileStoragePath: process.env.FILE_STORAGE_PATH ?? "server/.data/dev-db.json",
  uploadsDir: process.env.UPLOADS_DIR ?? "server/.data/uploads",
  port: Number(process.env.API_PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://127.0.0.1:5173",
  appBaseUrl: process.env.APP_BASE_URL ?? "http://127.0.0.1:5173",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  masterTelegramIds: (process.env.MASTER_TELEGRAM_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
  allowDevAuth: process.env.ALLOW_DEV_AUTH === "true",
};
