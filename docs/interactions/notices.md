# Context banners and diagnostic reports

Approved with Toby on 2026-11-02: use the Context banner design **at the bottom of the affected page, fixed outside the scrolling content**. Use the canonical [UI terminology](../ui-terminology.md).

## Placement and interaction

`NoticeBanner` is the shared operation-failure surface. A document banner is a flex sibling after `.document-content`, inside that View. Card/PDF popups put it after their content, inside the popup’s modal surface. Settings errors remain inside the Settings Dialog. Startup/opening failures use the bottom of the Workspace manager page.

Do not attach a banner to document/editor/PDF scrolling content, place it at the top of the page, or use window-fixed positioning that crosses unrelated splits. An existing document notice stays with the split where it was reported when another split becomes active. If that split closes, the remaining active split receives it. A popup/Settings Dialog must not have a duplicate inaccessible banner behind it.

The banner has an opaque theme surface, a quiet top rule, a severity icon, readable summary and optional document/context label. Actions are visible buttons. Details starts collapsed. Expanded details scroll within the bounded banner; long messages and actions wrap in narrow splits. The shared scrollbar gutter keeps widths stable.

Errors announce their summary with `role=alert`; warnings use `role=status`. Showing a banner never moves focus away from an editor. Details and Copy report retain normal keyboard focus. Dismiss closes the notice without changing or discarding a draft. A repeated failed operation can show it again. Notices are transient UI, not Markdown or Workspace preferences.

Specific recovery actions remain owned by their callers. Copy draft and Reload from disk reuse existing handlers. Reload from disk still requires the existing discard confirmation. A failed save must leave its draft and popup open. Do not offer an invented Retry action when the operation cannot safely be repeated. Inline field validation and dedicated missing/unreadable-file recovery content retain their local roles; not every validation message becomes a page banner.

## Report contract

`noticeReport` produces a plain JSON report:

- `schemaVersion`: currently `1`.
- `severity`: `error` or `warning`.
- `code`: a caller-supplied code or the honest fallback `OPERATION_FAILED`.
- `message`: normalized technical error text.
- `document`: optional file or View context; contextual information is not proof that the file caused the error.
- `occurredAt`: UTC time when the notice was recorded.
- `appVersion`: the running app’s version, including the Test suffix; unavailable version lookup does not hide the error.

Do not infer specific error codes by matching English prose. Callers can provide more precise codes when the underlying error contract supplies them.

The report contains no automatically collected card body, draft, full Workspace snapshot or credential store. Workspace roots are replaced with `<workspace>`; URL credentials, query values and fragments, plus common credential headers/assignments, are removed from diagnostic text. This is a limited diagnostic-text scrub, not a guarantee that arbitrary third-party error messages contain no private data. The shown technical details and copied report use the same sanitized message.

Copy report uses the clipboard only after the user presses it. If clipboard writing fails, keep the original failure visible and offer a selectable report. Do not replace the original error with a clipboard error. A future Send to agent action should consume this report contract; there is no placeholder agent button or automatic transmission.

## Coverage

- `tests/notice.test.ts`: normalization, stable report fields, relative context and credential scrubbing.
- `tests/notice-banner.test.tsx`: focus preservation, disclosure, copying, clipboard fallback and recovery actions.
- `tests/desktop.test.tsx`: Settings error isolation, failed popup save and draft preservation.
- `npm run test:reader -- --ui-only`: actual Electron geometry at the View/popup/Settings bottom, scrolling, split ownership and report-copy assembly. Clipboard verification reconstructs saved writable `ClipboardItem`s from all MIME payloads before changing the clipboard, then restores them atomically.

Menu bar design, icon replacement, a persistent issue history and future agent integration remain separate work.
