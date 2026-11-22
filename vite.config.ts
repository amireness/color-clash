import { defineConfig } from "vite";

const proxy = {
  "/color-clash-ws": {
    target: `http://127.0.0.1:${process.env.ROOM_PORT ?? 8787}`,
    ws: true,
  },
};
export default defineConfig({ server: { proxy }, preview: { proxy } });
