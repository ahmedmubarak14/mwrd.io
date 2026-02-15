import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const githubRepository = process.env.GITHUB_REPOSITORY || '';
  const githubRepoName = githubRepository.includes('/') ? githubRepository.split('/')[1] : '';
  const isGithubPagesBuild = process.env.GITHUB_ACTIONS === 'true' && Boolean(githubRepoName);
  const resolvedBase = env.VITE_BASE_PATH || (isGithubPagesBuild ? `/${githubRepoName}/` : '/');

  return {
    base: resolvedBase,
    server: {
      port: 5173,
      host: '0.0.0.0',
      allowedHosts: true,
    },
    plugins: [
      react(),
      {
        name: 'strip-crossorigin-from-generated-assets',
        transformIndexHtml(html) {
          // Prevent browsers from treating same-origin bundle files as CORS requests.
          return html.replace(/\s+crossorigin(?=(\s|>))/g, '');
        },
      },
    ],
    // SECURITY: Gemini API key removed from client bundle.
    // AI features must go through a server-side proxy (edge function).
    define: {},
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    // Expose Supabase environment variables (VITE_ prefixed vars are automatically exposed)
    envPrefix: ['VITE_'],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Split heavy vendor libraries into their own chunks
            if (id.includes('node_modules')) {
              if (id.includes('react-dom')) return 'vendor-react';
              if (id.includes('react-router')) return 'vendor-react';
              if (id.includes('@supabase')) return 'vendor-supabase';
              if (id.includes('i18next') || id.includes('react-i18next')) return 'vendor-i18n';
              if (id.includes('react-hook-form') || id.includes('zod') || id.includes('@hookform')) return 'vendor-forms';
              if (id.includes('dompurify') || id.includes('html2canvas')) return 'vendor-dom-utils';
              if (id.includes('gsap')) return 'vendor-gsap';
            }
          },
        },
      },
    },
  };
});
