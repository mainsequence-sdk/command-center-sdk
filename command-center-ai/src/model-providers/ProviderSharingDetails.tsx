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
    <p>Sharing this configured provider lets recipients receive and copy its credentials in their own runtime, including local Tau. Only share with people and workload operators you trust. Their usage counts against the provider quota or billing associated with these credentials. Removing access stops future credential retrieval; credentials already received may work until they expire or are revoked at the provider.</p>
    {renderSharing?.(target)}
  </Dialog>;
}
