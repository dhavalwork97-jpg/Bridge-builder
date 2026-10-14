import { defineConfig, type Plugin } from 'vite';

/**
 * Optional platform SDK script injection. The SDK scripts are NOT bundled and are only
 * referenced in platform-specific builds (`--mode crazygames` / `--mode youtube`).
 * The default build has zero external URLs.
 * IMPORTANT: confirm the exact script URLs against each platform's current docs
 * before submitting (see docs/PLATFORMS.md).
 */
function platformSdk(mode: string): Plugin {
  const tags: Record<string, string> = {
    crazygames: '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>',
    youtube: '<script src="https://www.youtube.com/game_api/v1"></script>',
  };
  return {
    name: 'platform-sdk-tag',
    transformIndexHtml(html) {
      const tag = tags[mode];
      return tag ? html.replace('<!--PLATFORM_SDK-->', tag) : html;
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  define: { __PLATFORM__: JSON.stringify(mode === 'crazygames' || mode === 'youtube' ? mode : 'local') },
  plugins: [platformSdk(mode)],
  build: { target: 'es2020', sourcemap: false, assetsInlineLimit: 0, chunkSizeWarningLimit: 300 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
}));
