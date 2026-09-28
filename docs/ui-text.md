# UI text catalogs

Review and edit application wording in these two files:

- [`src/text/tooltips.ts`](../src/text/tooltips.ts): hover explanations, icon-button labels and menu hints.
- [`src/text/ui.ts`](../src/text/ui.ts): visible labels, menus, dialogs, empty states, accessibility names, status/error messages and new history-entry labels. Shared by the renderer, Electron main process and workspace worker.

These are plain typed objects grouped by feature. The catalog files are the review list and the source of truth; do not maintain a second copy of their wording in documentation. Stable keys describe the purpose, so changing wording does not require renaming a key. No new dependency or runtime translation service is involved.

## Using the catalogs

```tsx
<Tool icon="plus" label={tooltips.common.newCard} />
<button data-tooltip={tooltips.workspace.open}>{ui.workspace.open}</button>
```

Use a typed formatter for dynamic text, such as `ui.card.count(count)` or `tooltips.history.checkpoint(label, active)`. Keep the entire phrase in the formatter, including punctuation and singular/plural forms; do not concatenate translated fragments in a component. Render returned strings as text, not markup.

A control whose tooltip simply repeats its existing centralized View name, icon name, status or user-provided file path may reuse that value. Do not copy these labels into both catalogs. A short tooltip may also supply an icon button's accessible name. Longer help is separate from the accessible name.

User filenames, paths, note bodies, tags, property names, saved checkpoint labels and external error details are data. Do not replace them with catalog entries. Catalog changes affect new history entries, never rewrite existing Git history. Application state keys, IPC commands, CSS classes and file-format fields are identifiers, not UI text.

## Copy rules

- Name an action or state directly. Avoid “Click to…”, “Hover to…” and “Click to switch…”.
- Use **card**, **whiteboard**, **Workspace**, **Action Ribbon**, **Main Dock**, **Left/Right Side Dock**, **View** and **Tab Group** consistently. Nesting does not change “New whiteboard” into “New sub-whiteboard”.
- Use sentence case for actions; retain capitalization for established interface names.
- Explain an unfamiliar gesture, disabled action, destructive consequence or shortcut when it helps. Do not repeat a fully visible menu label in a tooltip.
- Keep development milestones and implementation plans out of hover help.
- Preserve actionable recovery/conflict information and warnings about unsaved work.
- Keep input and output names intact, including spaces, punctuation, emoji and non-English text.

Tooltip timing, dismissal and positioning still belong to the [menu and tooltip interaction contract](interactions/menus-and-tooltips.md). This migration changes wording and where it is stored; it does not change overlay behavior.

## Migration review

The first review covered renderer controls, menu hints, native application menus, dialogs, status/recovery messages, validation errors exposed to the UI and new history labels. It made these wording corrections:

| Previous wording | Reviewed wording |
| --- | --- |
| Navigation device with “Click to switch…” instructions | Navigation device: Auto / Mouse / Trackpad, showing the current value |
| New note | New card |
| Activity bar / Document area | Action Ribbon / Main Dock |
| left/right dock | Left/Right Side Dock |
| Close View Tab | Close View tab |
| Kanban tooltip containing a future development milestone | Group cards by a property |
| Tooltip naming whiteboard placement as part of backlinks | Cards that link here |
| Internal icon keys such as `note` | Readable icon names such as Card |
| 1 cards in tag results | 1 card |

Settings labels, Settings help, Settings validation copy and configurable defaults are intentionally deferred. The settings action/title remains unchanged. Sample note contents, third-party Emoji Mart text and OS-provided role-menu labels also remain with their original owners. No new user setting or localization framework was added.

`tests/text.test.ts` checks the usual renderer entry points for stray inline labels and menu copy, with an explicit Settings exception. It supplements the interaction tests; it is not a complete natural-language detector. Review dynamic expressions and new main-process/worker messages when changing those areas.
