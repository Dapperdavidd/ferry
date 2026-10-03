# Ferry

Read `README.md` first, then `docs/specs/cross-border-ausd-design.md`. The design doc is the
source of truth for the architecture and the API contract; `apps/mobile/utils/apiClient.ts`
is that contract in code.

Conventions:

- Commit messages are detailed and in plain prose: what changed and why, no bullet lists of
  files, no attribution trailers.
- Keep comments sparse. A comment explains a non-obvious invariant or a choice that looks
  like a bug; it never restates the code.
- Never change the passkey relying party (`ferry.money`) or the key derivation in
  `apps/mobile/lib/mera/derive.ts`. The pinned-vector test guards the second.
- Secrets never enter the repo or a public env var. The relayer key lives in the API's
  environment only.
- `apps/backend` is Xend's old backend, kept for porting only. Do not build on it.
- The ADRs under `docs/adr/` are Xend's; the styling and Expo ones still apply.
