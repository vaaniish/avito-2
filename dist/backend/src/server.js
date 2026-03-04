"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = require("./app");
const PORT = Number(process.env.PORT ?? 3001);
app_1.app.listen(PORT, () => {
    console.log(`Backend is running on http://localhost:${PORT}`);
});
//# sourceMappingURL=server.js.map