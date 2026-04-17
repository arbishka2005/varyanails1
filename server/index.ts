import { createApp } from "./app.js";
import { config } from "./config.js";
import { runMigrations } from "./db/migrate.js";
import { startAppointmentScheduler } from "./notifications/scheduler.js";
import { notifyClient } from "./notifications/telegram.js";
import { repository } from "./repositories/index.js";

const app = createApp();

async function start() {
  if (config.storageDriver === "postgres") {
    await runMigrations();
  }

  await repository.bootstrapSeedData();
  startAppointmentScheduler({
    repository,
    notifyClient,
    appBaseUrl: config.appBaseUrl,
  });

  app.listen(config.port, () => {
    console.log(`Varya Nails API listening on http://127.0.0.1:${config.port}`);
  });
}

void start().catch((error) => {
  console.error("Failed to start API:", error);
});
