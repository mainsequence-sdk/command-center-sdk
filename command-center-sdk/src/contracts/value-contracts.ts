import type { WidgetContractId } from "./widget-contracts.js";

export const CORE_VALUE_STRING_CONTRACT = "core.value.string@v1" as const;
export const CORE_VALUE_NUMBER_CONTRACT = "core.value.number@v1" as const;
export const CORE_VALUE_INTEGER_CONTRACT = "core.value.integer@v1" as const;
export const CORE_VALUE_BOOLEAN_CONTRACT = "core.value.boolean@v1" as const;
export const CORE_VALUE_JSON_CONTRACT = "core.value.json@v1" as const;

export const CORE_VALUE_SCALAR_CONTRACTS = [
  CORE_VALUE_STRING_CONTRACT,
  CORE_VALUE_NUMBER_CONTRACT,
  CORE_VALUE_INTEGER_CONTRACT,
  CORE_VALUE_BOOLEAN_CONTRACT,
] as const satisfies readonly WidgetContractId[];
