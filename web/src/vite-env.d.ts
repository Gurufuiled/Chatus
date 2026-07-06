/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_LOGINUS_ORIGINS?: string;
  readonly VITE_DEV_SKIP_EMBED_AUTH?: string;
  readonly VITE_DEV_ACCESS_TOKEN?: string;
  readonly VITE_APP_MODE?: 'embed' | 'standalone';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.svg' {
  const src: string;
  export default src;
}
