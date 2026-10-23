/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_DATADOG_ENABLED?: string
  readonly VITE_DATADOG_APPLICATION_ID?: string
  readonly VITE_DATADOG_CLIENT_TOKEN?: string
  readonly VITE_DATADOG_SITE?: string
  readonly VITE_DATADOG_SERVICE?: string
  readonly VITE_DATADOG_ENV?: string
  readonly VITE_DATADOG_VERSION?: string
  readonly VITE_DATADOG_REPLAY_SAMPLE_RATE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
