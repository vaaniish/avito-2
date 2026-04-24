import 'dotenv/config';
import { app } from "./app";
import { assertSessionTokenConfiguration } from "./lib/session-token";

const PORT = Number(process.env.PORT ?? 3001);

assertSessionTokenConfiguration();

const server = app.listen(PORT, () => {
  console.log(`Backend is running on http://localhost:${PORT}`);
});

function shutdown(signal: string): void {
  console.log(`Received ${signal}, shutting down backend...`);
  server.close(() => {
    console.log("Backend shutdown complete");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
