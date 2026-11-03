# UI work

Before every UI-related task or design discussion, read `docs/ui-terminology.md`. It is the canonical vocabulary agreed with the user; source terminology from that file, not from memory, old previews, historical documentation or implementation names. Use its exact names in UI text, documentation and conversation. Preserve internal identifiers and saved formats unless a separate task requires changing them.

Before changing UI or interactions, read `docs/design-system.md` and the applicable `docs/interactions/` specification. Reuse the existing shared controls and interaction helpers; do not substitute a browser-native interaction or a separate local implementation when a shared one exists.

Keep the approved design as the visual baseline. If a requested change requires deviating from a UI guideline or the approved design, discuss the specific deviation and tradeoff with the user before implementing it. Routine changes that follow the guidelines do not need another approval.

Update the relevant documentation and a meaningful regression check when changing shared interaction behavior. Verify geometry and motion in the real Electron renderer; DOM-only tests cannot establish their visual correctness.
