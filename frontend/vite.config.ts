import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig({
  root: __dirname,
  // Use repository-level .env for frontend variables too.
  envDir: path.resolve(__dirname, ".."),
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "esnext",
    outDir: "../dist/frontend",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 3000,
    open: true,
  },
});
