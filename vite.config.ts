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
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    // Expose Supabase environment variables (VITE_ prefixed vars are automatically exposed)
    envPrefix: ['VITE_'],
  };
});
