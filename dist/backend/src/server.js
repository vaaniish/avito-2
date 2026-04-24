"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = require("./app");
const session_token_1 = require("./lib/session-token");
const PORT = Number(process.env.PORT ?? 3001);
(0, session_token_1.assertSessionTokenConfiguration)();
const server = app_1.app.listen(PORT, () => {
    console.log(`Backend is running on http://localhost:${PORT}`);
});
function shutdown(signal) {
    console.log(`Received ${signal}, shutting down backend...`);
    server.close(() => {
        console.log("Backend shutdown complete");
        process.exit(0);
    });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
//# sourceMappingURL=server.js.map