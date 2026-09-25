import { platformRequestProxy } from "@dev-mainsequence/command-center-sdk/vite";

// Local development only: the dev server sends a top-level page's platform requests with the
// developer's MAINSEQUENCE_ACCESS_TOKEN. A deployed site sends them through its host.
export default {
  plugins: [platformRequestProxy()],
};
