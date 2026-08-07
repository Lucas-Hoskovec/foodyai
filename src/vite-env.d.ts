/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NIM_API_KEY?: string
  readonly VITE_NIM_BASE_URL?: string
  readonly VITE_NIM_MODEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}