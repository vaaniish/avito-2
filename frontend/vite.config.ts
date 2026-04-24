import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig({
  root: __dirname,
  // Use repository-level .env for frontend variables too.
  envDir: path.resolve(__dirname, ".."),
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      {
        find: /^\.\/icons\/battery-charging\.js$/,
        replacement: path.resolve(__dirname, "./src/vendor/lucide/battery-charging.js"),
      },
      {
        find: /^\.\/icons\/battery-full\.js$/,
        replacement: path.resolve(__dirname, "./src/vendor/lucide/battery-full.js"),
      },
      {
        find: /^\.\/icons\/battery-low\.js$/,
        replacement: path.resolve(__dirname, "./src/vendor/lucide/battery-low.js"),
      },
      {
        find: /^\.\/icons\/battery-medium\.js$/,
        replacement: path.resolve(__dirname, "./src/vendor/lucide/battery-medium.js"),
      },
      {
        find: /^\.\/icons\/battery-plus\.js$/,
        replacement: path.resolve(__dirname, "./src/vendor/lucide/battery-plus.js"),
      },
      {
        find: /^\.\/icons\/battery-warning\.js$/,
        replacement: path.resolve(__dirname, "./src/vendor/lucide/battery-warning.js"),
      },
      {
        find: /^\.\/icons\/battery\.js$/,
        replacement: path.resolve(__dirname, "./src/vendor/lucide/battery.js"),
      },
      {
        find: /^\.\/battery-charging\.js$/,
        replacement: path.resolve(__dirname, "./src/vendor/lucide/battery-charging.js"),
      },
      {
        find: /^\.\/battery-full\.js$/,
        replacement: path.resolve(__dirname, "./src/vendor/lucide/battery-full.js"),
      },
      {
        find: /^\.\/battery-low\.js$/,
        replacement: path.resolve(__dirname, "./src/vendor/lucide/battery-low.js"),
      },
      {
        find: /^\.\/battery-medium\.js$/,
        replacement: path.resolve(__dirname, "./src/vendor/lucide/battery-medium.js"),
      },
      {
        find: /^\.\/battery-plus\.js$/,
        replacement: path.resolve(__dirname, "./src/vendor/lucide/battery-plus.js"),
      },
      {
        find: /^\.\/battery-warning\.js$/,
        replacement: path.resolve(__dirname, "./src/vendor/lucide/battery-warning.js"),
      },
      {
        find: /^\.\/battery\.js$/,
        replacement: path.resolve(__dirname, "./src/vendor/lucide/battery.js"),
      },
    ],
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
