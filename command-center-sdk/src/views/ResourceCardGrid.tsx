import { useSdkTranslation } from "../localization/react.js";
import type { ReactNode } from "react";

import type { ResourceId } from "../resource/types.js";

export interface ResourceCardGridProps<T, Id extends ResourceId> {
  emptyContent?: ReactNode;
  getId: (item: T) => Id;
  items: readonly T[];
  renderCard: (item: T) => ReactNode;
}

/** Standard responsive collection presentation for resources that are better represented as cards. */
export function ResourceCardGrid<T, Id extends ResourceId>({
  emptyContent: emptyContentProp,
  getId,
  items,
  renderCard,
}: ResourceCardGridProps<T, Id>) {
  const { t } = useSdkTranslation();
  const emptyContent = emptyContentProp ?? t("noTableResults");

  if (items.length === 0) {
    return <div className="cc-resource-card-grid__empty">{emptyContent}</div>;
  }

  return (
    <div className="cc-resource-card-grid">
      {items.map((item) => (
        <article key={getId(item)} className="cc-resource-card-grid__item">
          {renderCard(item)}
        </article>
      ))}
    </div>
  );
}
