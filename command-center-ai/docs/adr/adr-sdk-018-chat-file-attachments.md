# SDK ADR 018: File Attachments in the Shared Chat Interface

- Status: Proposed — requirements recorded; not implemented
- Date: 2026-10-19
- Owners: Command Center AI maintainers
- Package: `@dev-mainsequence/command-center-ai`
- Companion: [MS Tau SDK ADR 0024: Chat attachments and authorized content delivery](https://github.com/mainsequence-sdk/ms-tau-sdk/blob/development/docs/adrs/0024-chat-attachments-and-authorized-content-delivery.md),
  which owns the runtime side of the contract
- Related: [ADR 060](./adr-060-session-backed-chat-request-contract.md),
  [ADR 087](./adr-087-queued-chat-messages-while-the-agent-works.md) (section 7),
  [ADR 098](./adr-098-one-communication-contract-for-every-agent.md), and
  [ADR 099](./adr-099-local-agents-through-the-same-engine.md)

## Context

Applications need a person to be able to attach a file in the chat and ask about its content.
Command Center AI 0.0.15 exposes no file picker, upload lifecycle or attachment configuration in
`ChatThread` or `ChatComposer`. The engine has generic file-part serialization,
but this alone is not a supported end-to-end feature. The conversation contract explicitly lists
files, sources and attachments among the content the thread does not draw.

MS Tau SDK 2.0.18 extracts only text from `/api/chat`; the inspected 2.0.19 source has the same
limitation. A2A has a separate inline-PDF path, which does not make the chat composer or
`/api/chat` attachment-capable. An application may already have its own authorized
document-upload service, separate from the chat.

[ADR 087](./adr-087-queued-chat-messages-while-the-agent-works.md) section 7 keeps queued messages
text-only and leaves queued attachments to their own decision. Section 4 below records the
requirements for that decision.

## Proposed decision and requirements

### 1. One attachment experience in the shared package

`ChatThread` and the standalone `ChatComposer` must share accessible attachment controls on the
rail and expanded page: a file picker, file drag/drop, and pasted files/images where the browser
supports them. Plain-text paste must retain its existing behavior. Show each attachment's name,
media type, size and state, with a safe preview where supported, removal, cancellation and retry.
Keyboard operation, screen-reader status announcements and narrow-screen layouts are required.

An attachment-only message and a message combining text and files must both be sendable. No
placeholder text should be invented to satisfy the current text-only parser. An upload failure
must not silently send only the remaining text or a subset of selected files.

### 2. Capability-driven admission

The engine must obtain a versioned attachment capability from the selected runtime and respect
application policy and the selected model's capabilities. An older or unsupported runtime must
keep working for text and must not show an attachment control that cannot work.

The capability must state supported media types, file count, per-file and aggregate byte limits,
available content-processing modes and lifecycle operations. The UI uses the most restrictive
app/runtime/model limits; the server enforces them independently. Revalidate when the session,
model or runtime changes. Show an actionable explanation when a selected attachment becomes
unsupported, without dropping it from the draft.

The package hardcodes no media types or sizes; each application sets its own policy within the
runtime's capability. The first capability must be able to express common document and image
types, such as PDF, PNG, JPEG and plain text, with per-file limits. The A2A PDF limits do not
define the chat capability.

### 3. A shared transport contract and application integration seam

Agree the versioned capability, upload/finalize/cancel, message-part, history and error schemas
with MS Tau SDK ADR 0024 before implementation. The intended chat representation uses durable,
server-issued attachment references; transient browser object URLs and arbitrary remote URLs are
not durable attachment identities. Exact route and field names remain a design gate, not an API
declared by this ADR.

The package owns composer state, rendering and transport integration. It must provide a typed,
documented seam for an application's authorized document-upload service to supply compatible
references and lifecycle status. It must not embed any application's routes or grant business
access. Runtime access remains session-specific under ADR 098; local mode uses the same engine
contract under ADR 099. Do not switch the chat to A2A to obtain file support.

If new routes or request bodies require changes to the SDK's local proxy or the hosted platform
forwarder, record that dependency and its release order. Preserve route allowlists, same-origin
checks, runtime admission and existing credential boundaries.

### 4. Drafts, queues and history

This section is the queued-attachment decision that ADR 087 section 7 deferred.

Files must stay associated with their intended message and session through upload, queueing,
reordering, retry and send. Send is eligible only when every retained attachment is ready. A
queued message must not acquire a later draft's files or silently lose its own. Define removal,
cancel and expiry semantics separately from stopping an admitted agent turn.

Committed history must render attachments and their availability after reload in both hosted and
local mode. Render expired, deleted and inaccessible attachments explicitly. Preserve authorized
attachment references for send-again and edit-and-send-again actions, or explain why they cannot
be reused; never silently resend only text. Reload recovery of drafts/queued messages must either
restore authorized references or ask for reselection explicitly. Do not persist file bytes or
credentials in browser storage. Adding references to the queue's `sessionStorage` record is a
persisted-shape change that needs a migration. Existing queue hold-after-reload behavior remains
authoritative.

The thread must not present a delivered attachment as read: receiving a file is not evidence that
the agent successfully read it.

## Out of scope: answer source references

Rendering answer source references (which file/document revision an answer used and, where
available, its page or section, with preview or download access checked again by the owner
service) is a separate follow-up decision. It depends on the runtime's source-part schema and on
agent behavior rather than on the composer, and the thread does not draw sources today. It needs
its own `SDK ADR` once the attachment contract is settled.

## Acceptance gates for the future implementation

### Command Center AI

1. Browser tests exercise picker, drop and paste; keyboard controls; previews and removal;
   progress, cancellation and retry; and rail/page parity.
2. File-only, text-plus-file and multiple-file messages reach a real local Tau runtime as the
   agreed message parts, with the correct references.
3. Unsupported types, oversized files, aggregate/count limits, and the runtime's processing,
   expiry and access errors produce actionable messages in the UI without silent text fallback.
4. Queue reorder, session/model changes, send-again, connection loss and reload preserve the
   intended attachment association and do not duplicate uploads or admitted turns.
5. Local and hosted history fixtures agree; older runtimes retain text chat; reasoning, tool
   calls, streaming, Stop and readiness continue to work.
6. Publish compatible package versions, contract fixtures and integration instructions; test the
   installed packages locally before an application enables attachments.

### MS Tau SDK (companion ADR 0024)

These are dependencies, verified in MS Tau SDK, not by this package:

1. The runtime reads the content of file-only, text-plus-file and multiple-file messages, and its
   answers draw on that content.
2. The server enforces the capability's types (including spoofed types), sizes and counts
   independently of the UI, and reports processing failures as typed errors.
3. Cross-person, cross-session and cross-document access is denied. File content is treated as
   source data and cannot grant tools, permissions or instructions.
4. History returns attachment references with their availability, so expired, deleted and
   inaccessible files can be told apart.

## Compatibility and maintenance impact

This change records requirements only. There is no npm API, stylesheet class, browser storage,
installed skill content/name/path, installer, SDK peer range, platform route or payload change.
The ADR index and changelog record the proposal; existing guides and skills still describe the
shipped text-only interface. No package version or lockfile changes are required now.

The eventual implementation must review every maintenance axis, update the conversation and rail
guides and packaged skills, provide migrations for any persisted shape changes, and cover the
backend/history/forwarder impact. This ADR does not authorize that implementation or a release.

## Rollout

1. Finalize the shared contract with Tau ADR 0024 and identify any platform/proxy prerequisites.
2. Implement and release the runtime/history capabilities and the corresponding Command Center AI
   UI and engine, with compatible version ranges and local integration evidence.
3. Applications adopt attachments only after compatible releases are available. Each application
   decides its integration in its own repository.
