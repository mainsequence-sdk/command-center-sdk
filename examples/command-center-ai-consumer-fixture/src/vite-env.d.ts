// The one Vite value this fixture reads; a Vite application gets it from `vite/client`.
interface ImportMetaEnv {
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
