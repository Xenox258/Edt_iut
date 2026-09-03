import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icon2.png"
      ],
      devOptions: {
        enabled: false,
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 24 heures
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      manifest: {
        name: "BetterEDT",
        short_name: "BetterEDT",
        description: "Consultez et suivez l'emploi du temps interactif de l'IUT, même hors ligne.",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        icons: [
          {
            src: "/icon2.png",
            sizes: "500x500",
            type: "image/png",
            purpose: "any maskable",
          }
        ],
        shortcuts: [
          {
            name: "Voir la semaine",
            short_name: "Semaine",
            url: "/",
            description: "Accéder rapidement à l'emploi du temps de la semaine en cours"
          },
          {
            name: "Salles libres",
            short_name: "Salles",
            url: "/?view=free-rooms",
            description: "Consulter les salles disponibles"
          }
        ]
      }
    })
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    host: '0.0.0.0', // Écoute sur toutes les interfaces réseau
    port: 5173,
    strictPort: true,
    // Même origine en production (nginx) et proxy local pendant le dev.
    // Cela permet de conserver les vraies données sans dépendre d'un nom DNS
    // externe ou d'une valeur VITE_API_URL embarquée dans le bundle.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3005',
        changeOrigin: true,
      },
    },
    hmr: {
      host: "192.168.1.15", // L'adresse IP de votre Raspberry Pi
      protocol: 'ws',
    },
  },
});
