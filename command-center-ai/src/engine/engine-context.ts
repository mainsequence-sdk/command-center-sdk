import { createContext } from "react";

import type { ChatEngineValue, ChatRunStatusValue } from "./ChatEngineProvider.js";

// The two contexts every engine provides, the platform's and the local source's (ADR 099), so the
// chat's components read one value whichever Agent source is mounted.
export const ChatEngineContext = createContext<ChatEngineValue | null>(null);
export const ChatRunStatusContext = createContext<ChatRunStatusValue | null>(null);
