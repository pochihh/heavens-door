# Codebase architecture

This describes the implemented desktop preview. Product requirements, research notes and implementation plans remain local and excluded from Git.

## Processes and ownership

```text
Electron window (React + TipTap)
  Session: drafts, ordered commands, session undo
  preload: typed, restricted IPC bridge
          │
Electron main process
  windows, registered workspaces, dialogs, asset protocol
          │
One worker per canonical workspace root
  ordered filesystem mutations + watcher events
  Workspace: files, rebuildable SQLite index, Git checkpoints
```

`src/main.ts` owns windows and caches workers by the folder's real path. Windows for the same workspace share one index and mutation queue. Each window keeps its own focused editor, document tabs, split layout, scroll positions and board cameras. Side-dock arrangements are shared through workspace preferences. Idle workers currently live until application quit.

The renderer has no Node access. `src/preload.ts` exposes the `Bridge` in `src/shared.ts`. Main-process handlers validate the sending window and frame; the worker validates command payloads. Workspace paths reject traversal and symlinks. The asset protocol serves supported local images within an opened workspace. Remote images are not fetched.

## Files and derived state

| Data | Owner and location |
| --- | --- |
| Card content and stable identity | `.md`, YAML `card-id`; `src/core/format.ts` |
| Placement identity, geometry, collapsed state, intake column and edges | `.whiteboard`; `src/core/format.ts` |
| Tag definitions | `.tag`, indexed by `Workspace` |
| Theme, naming, icons, dock/document layouts, module navigation, Starred and Recent | `.heavens-door/settings.json`; `src/core/preferences.ts` |
| Search, backlinks and file revisions | Rebuildable SQLite index under Electron user data |
| Persistent checkpoints and branches | The workspace's app-managed `.git`; `src/core/history.ts` |
| Registered workspace paths | `workspaces.json` under Electron user data; `src/core/registry.ts` |

The Markdown files are authoritative. Indexing compares content hashes and reuses unchanged entries. Chokidar batches filesystem notifications; worker operations and watcher refreshes are serialized. Settings writes and file replacement use temporary files. Multi-file edits retain a recovery journal outside the workspace until completion.

Only `Folder/Folder.whiteboard` identifies a whiteboard: both basenames must match exactly and the file must parse successfully. On open, a missing `<workspace-name>.whiteboard` is created at the root; an invalid existing file is preserved and reported. The mother view contains only sub-whiteboards. Ordinary folders such as `assets/` do not become boards just because they exist. A board beneath ordinary folders appears under its nearest whiteboard ancestor. Board placements and card identities remain separate. The full membership and collapse contract is in [whiteboards.md](whiteboards.md).

`Workspace.automaticPlacements` adds missing direct-child cards to the folder's matching board. Internal note creation and its placement share one revision-checked recovery transaction and undo entry. Watcher batches update the index before reconciling affected folders; startup reconciles all boards. Only board metadata is amended when an external note is discovered. The folder index avoids rescanning all notes per change. First H1 titles are cached in the derived card index so collapsed rendering needs no body requests.

## Renderer map

| File | Responsibility |
| --- | --- |
| `App.tsx` / `src/layout.ts` | Desktop shell; shared validated document/dock layout data and operations |
| `Docks.tsx` | Equal side docks, module tabs, panel groups, resizing and module/group dragging |
| `WorkspaceMenu.tsx` | Bottom-left workspace switcher and workspace manager |
| `Explorer.tsx` | Whiteboard/file explorer, tags, search and saved-list modules with shared context actions |
| `documents.ts` | Snapshot-scoped identity/path maps; avoids a full card search for every row |
| `Icons.tsx` / `IconPicker.tsx` | Named Lucide imports and lazy, locally bundled Emoji Mart picker |
| `Overlays.tsx` | Delegated hover/focus tooltip and keyboard-accessible action menu |
| `sortable.ts` | Pointer drag session for Starred; see the interaction specification |
| `DocumentViews.tsx` | Card, board, tag and read-only physical-file views |
| `Board.tsx` / `navigation.ts` | Visible-card rendering, level of detail, selection and board gestures |
| `Editor.tsx` / `editor-schema.ts` | Formatted TipTap editing and supported Markdown conversion |
| `session.ts` / `history.ts` | In-flight draft protection, mutation sequencing and grouped undo |
| `Recovery.tsx` | Recoverable renderer-error screen |

Explorer's whiteboard tree uses the index snapshot. Physical-file mode enumerates only expanded directories using `src/core/files.ts`; it includes dotfiles, internal folders and attachments. Symlinks are listed without being followed. The ordinary-folder “New note” action writes a card without creating a whiteboard. Existing cards and board/tag files open their normal views; **View source** opens read-only text. Text inspection is limited to 2 MiB, images use the local asset protocol, and PDFs/other binaries offer **Reveal file**. Physical filesystem rename/delete/move and a full PDF reader are not part of this explorer slice.

## Editing, switching and recovery

A `Session` serializes app commands. UI preference patches are debounced for 250ms, merged by module for navigation state, and flushed before close/reload/workspace switching. Failed writes retain pending preferences for retry; callbacks from an old workspace are ignored. Static layout JSON is independent of the rebuildable index. See [UI terminology and state ownership](ui-terminology.md). Draft saves retain keystrokes arriving during an earlier save. Every persisted edit checks the observed revision; external conflicts preserve the draft. Undo groups nearby typing and shares the command order with board edits. Board movement updates DOM transforms while dragging and persists final geometry once the gesture ends. Its document-level pointer handlers tolerate losing pointer capture.

Switching workspaces first flushes the current draft. While opening, the workspace UI is inert. Main attaches the new worker only after it has opened successfully, and the renderer clears session undo only after receiving the new snapshot. An unavailable workspace leaves the previous workspace selected. Registered paths are canonicalized, deduplicated and written atomically. Registration is local to the desktop application; appearance and navigation preferences belong to each workspace.

Git history is separate from session undo. Checkpoints include non-ignored workspace files; automatic checkpoints currently run after five idle minutes. Restore first preserves current work, then creates a branch at the selected checkpoint. Existing unmanaged repositories are not adopted. Staged changes or an unfinished terminal Git operation pause app history. The current history list is capped at 200 checkpoints; pruning is disabled.

## Working on the code

Run `npm run check` for lint, types, tests and the production build. Run `npm run benchmark` for the disposable 10,000-card indexing/search benchmark. `npm run dev` starts Electron and Vite; restart it after main/worker changes. Renderer reload alone does not replace those processes.

Keep a new feature in the existing owner above. Add a shared helper only for an actual shared behavior. Changes to list dragging must update its interaction specification and regression test together. Check desktop interactions in a disposable workspace; never auto-migrate a user's files on open. Windows and Ubuntu are targets, but native UI verification so far has been on macOS.
