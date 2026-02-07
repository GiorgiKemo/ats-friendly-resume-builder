import { defineConfig } from 'vite' // Removed loadEnv
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command: _command, mode: _mode }) => { // command was unused, mode is now unused
  // Load env file based on `mode` in the current directory
  // const env = loadEnv(mode, process.cwd(), '') // env was unused

  return {
    plugins: [
      react({
        // Optimize React refresh for better performance
        fastRefresh: true,
        // Optimize JSX compilation
        jsxRuntime: 'automatic',
      })
    ],

    // Optimize build for production
    build: {
      // Use terser for better minification
      minify: 'terser',
      terserOptions: {
        compress: {
          // Remove console logs in production
          drop_console: true,
          drop_debugger: true,
          // Optimize pure functions
          pure_funcs: ['console.log', 'console.info', 'console.debug'],
          // Aggressive optimizations
          passes: 2,
          ecma: 2020,
          unsafe_arrows: false, // Disabled for safety
          unsafe_methods: false // Disabled for safety
        },
        mangle: {
          safari10: false
        }
      },
      // Improve chunking strategy
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Core React packages
            if (id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/scheduler/')) {
              return 'react-core';
            }

            // React Router (keep small)
            if (id.includes('node_modules/react-router') ||
              id.includes('node_modules/@remix-run/router')) {
              return 'routing';
            }

            // UI-related packages
            if (id.includes('node_modules/react-icons/') ||
              id.includes('node_modules/react-hot-toast/') ||
              id.includes('node_modules/classnames/')) {
              return 'ui';
            }

            // Animation (only load when needed)
            if (id.includes('node_modules/framer-motion/')) {
              return 'animations';
            }

            // PDF-related packages (lazy load)
            if (id.includes('node_modules/html2canvas/') ||
              id.includes('node_modules/jspdf/') ||
              id.includes('node_modules/pdfmake/') ||
              id.includes('node_modules/react-pdf/')) {
              return 'pdf';
            }

            // Stripe (only load on payment pages)
            if (id.includes('node_modules/@stripe/')) {
              return 'stripe';
            }

            // Supabase (backend APIs)
            if (id.includes('node_modules/@supabase/')) {
              return 'backend-api';
            }

            // All other vendor code
            if (id.includes('node_modules/')) {
              return 'vendors';
            }
            return undefined; // Default return if no conditions are met
          },
          // Optimize chunk naming
          chunkFileNames: 'assets/js/[name]-[hash].js',
          // Optimize asset naming
          assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
        }
      },
      // Increase the warning limit to reduce noise
      chunkSizeWarningLimit: 1200,
      // Enable source maps in production for better debugging
      sourcemap: 'hidden', // 'hidden' means source maps are generated but not referenced in the JS files
      // Optimize CSS
      cssCodeSplit: true,
      // Reduce bundle size
      target: 'es2020',
    },

    // Optimize server performance
    server: {
      port: 5174,
      strictPort: true,
      hmr: {
        // Disable HMR overlay to reduce main thread work
        overlay: false,
      },
    },

    // Optimize asset handling
    assetsInclude: ['**/*.svg', '**/*.png', '**/*.jpg', '**/*.webp'],

    // Define environment variable replacements
    define: {
      // Expose environment variables to the client
      // Only expose variables that are safe to be public
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.npm_package_version),
    },

    // Optimize dependencies
    optimizeDeps: {
      include: [
        'date-fns/locale/en-US', // Attempt to force pre-bundling of date-fns English locale
        'date-fns'
      ],
    },
  }
})
