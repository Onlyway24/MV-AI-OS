# Atomic Telegram Session / Mission-Draft Coordination

Checkpoint C connects one already-authorized durable Telegram operator session to one
durable structured Mission draft. It is a local coordination boundary only. The
public `/mission` command remains inactive, and this layer cannot call Mission
planning, Mission Quality Gate, Workflow creation, Agent Runtime, models, providers,
tools, network resources, or external actions.

## Durable invariant

For every active Mission interaction, the session and draft have the same exact
session identity, actor, workspace, authorized user/chat identity hash, expiry, and
optimistic version. The draft table remains keyed by `session_id`, enforcing one
durable draft per session. Creation, each structured operation, the session
transition, the draft update, its receipt, and callback consumption are committed in
one SQLite transaction where they logically belong together.

The coordination facade supports start, resume/read, one structured field update,
back navigation, review opening, review readiness, structured confirmation,
cancellation, explicit-discard restart, and expiry. Restart recovery revalidates the
complete pair instead of trusting a stored reference.

## Callback boundary

Mission callbacks persist only a random token hash and the validated structured
coordination command. They bind the exact authorized identity, actor, workspace,
session, draft, session version, draft version, coordination action, optional context
fingerprint, and expiry. Token consumption and mutation share one transaction.
Forged, stale, expired, mismatched, and already-consumed tokens fail closed.
Cancellation, expiry, and explicit-discard restart invalidate outstanding callbacks.

No raw Telegram Update, message envelope, transcript, personal profile, username,
phone data, callback payload, or bot token is stored by this layer.

## Privacy and recovery

Cancellation and expiry retain only the minimum terminal identity/version evidence:
collected Mission fields and earlier content-bearing operation receipts are removed,
lists are emptied, and the terminal receipt is privacy-minimized. Confirmation keeps
the validated structured draft so a process restart restores the exact confirmed
state. Restarting a terminal draft requires an explicit discard confirmation and
invalidates all authority attached to the prior draft.

## Adversarial review

| Priority | Finding | Resolution |
| --- | --- | --- |
| P0 | None | No P0 finding was identified. |
| P1 | Direct draft writes could desynchronize a coordinated session. | Direct Checkpoint-B operations are rejected once a session enters coordinated Mission state. |
| P1 | Existing sessions could be reopened with different actor/workspace ownership. | Session reuse now verifies exact durable ownership. |
| P1 | Generic expiry updated indexed columns without reconstructing validated session JSON and deleted the draft reference. | Expiry now uses the same atomic state engine and coordination transaction. |
| P1 | Terminal receipts could retain collected Mission content. | Cancellation/expiry minimize the terminal draft and delete earlier content-bearing receipts atomically. |
| P1 | Callback consumption was not bound to Mission draft/version/context. | Schema v16 adds exact Mission callback snapshot bindings and atomic one-use consumption. |
| P2 | Missing, corrupt, or wrongly owned draft rows could be mistaken for resumable state. | Every read validates the draft and the complete session/draft pair before returning it. |
| P2 | Mid-transaction failure could leave uncertainty without direct proof. | An injected fault test proves rollback after the draft write leaves both records unchanged. |
| P3 | None open | No release-blocking P3 issue remains in Checkpoint C. |

Focused tests also prove restart recovery, stale-version rejection, callback replay,
double click, expiry, forgery, cancellation, explicit restart, privacy-safe storage,
and absence of planning or execution imports.
