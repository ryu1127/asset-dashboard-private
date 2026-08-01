import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves this project from /asset-dashboard-private/.
// Use that base path only for production builds so local `npm run dev`
// keeps working at the root path.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/asset-dashboard-private/" : "/",
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
}));
