/// <reference types="vite/client" />

// Documents the build-time surface. `VITE_BASE_PATH` is deliberately absent: it is
// consumed by vite.config.ts, never by application code, which reads the resolved value
// as `import.meta.env.BASE_URL`.
interface ImportMetaEnv {
  readonly VITE_FACILITATOR_USERNAME?: string;
  readonly VITE_FACILITATOR_PASSWORD?: string;
  readonly VITE_POLLING_API_URL?: string;
  readonly VITE_EXTERNAL_POLL_URL?: string;
  readonly VITE_EXTERNAL_POLL_QUESTION?: string;
  readonly VITE_EXTERNAL_POLL_RESULTS_URL?: string;
  readonly VITE_EXTERNAL_POLL_LABEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
