import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // VITE_* lokalt, NEXT_PUBLIC_* från Vercels Supabase-integration.
  // Bara publika prefix – SUPABASE_SECRET_KEY når aldrig webbläsaren.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Gissa året',
        short_name: 'Gissa året',
        description: 'Lyssna 10 sekunder och gissa vilket år låten kom ut.',
        lang: 'sv',
        theme_color: '#1b0f3b',
        background_color: '#1b0f3b',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Ljudklipp och API-anrop ska aldrig cachas av service workern
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
})
