import type { ModelProviderCatalogProvider } from "../backend/model-catalog-api.js";

type ProviderAuthenticationState = Pick<
  ModelProviderCatalogProvider,
  "authenticated" | "credentialStatus"
>;

export function getProviderAuthenticationLabel(authState: ProviderAuthenticationState) {
  if (authState.authenticated) {
    return "Signed in";
  }

  return authState.credentialStatus === "active" ? "Requires sign-in" : "Not signed in";
}
