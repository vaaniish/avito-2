import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig({
  root: __dirname,
  // Use repository-level .env for frontend variables too.
  envDir: path.resolve(__dirname, ".."),
  plugins: [react()],
  resolve: {
    alias: [{ find: "@", replacement: path.resolve(__dirname, "./src") }],
  },
  build: {
    target: "esnext",
    outDir: "../dist/frontend",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("xlsx-populate")) return "xlsx-populate";
          return "vendor";
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 3000,
    open: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
      },
    },
  },
});
