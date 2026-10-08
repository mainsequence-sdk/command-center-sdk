import type { ReactNode } from "react";
import { Dialog } from "../ui/Dialog.js";

export interface ProviderSharingTarget {
  uid: string;
  name: string;
  ownerUserUid: string;
  organizationEnvironmentUid: string;
  resource: "model-provider-credentials" | "custom-model-providers";
}

export function ProviderSharingDetails({ target, onClose, renderSharing }: {
  target: ProviderSharingTarget;
  onClose: () => void;
  renderSharing?: (target: ProviderSharingTarget) => ReactNode;
}) {
  return <Dialog open onClose={onClose} title={`${target.name}: details and sharing`}>
    <dl><dt>Configured provider</dt><dd>{target.name}</dd>
      <dt>Owner</dt><dd>{target.ownerUserUid}</dd>
      <dt>Environment</dt><dd>{target.organizationEnvironmentUid}</dd></dl>
    <p>Sharing this configured provider lets recipients receive and copy its credentials in their own runtime, including local Tau. Only share with people and workload operators you trust. Their usage counts against the provider quota or billing associated with these credentials. Removing access stops future credential retrieval; credentials already received may work until they expire or are revoked at the provider. Organization admins don't need a share: they can receive and use the credentials of any configured provider in the Organization, and their usage counts against it too. An admin with none of their own for a provider gets the first one added in that Environment.</p>
    {renderSharing?.(target)}
  </Dialog>;
}
