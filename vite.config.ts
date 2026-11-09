import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dev-сервер: все три страницы интерфейса доступны в браузере
// («/» — окно приложения, «/overlay.html» и «/widget.html» — их витрины).
// Продакшен-сборка — отдельные конфиги vite.app/overlay/widget (см. npm run build).
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // Режим макета (npm run dev:proto): корень открывает витрину вариантов
    // интерфейса, чтобы её можно было показать по одной ссылке.
    mode === "proto" && {
      name: "yawa:proto-root",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === "/") req.url = "/proto.html";
          next();
        });
      },
    },
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
}));
