# Boards and System

The whiteboard explorer starts with the workspace's root whiteboard as a normal expandable board row. Its child boards follow beneath it. System contains Templates, Slipbox, Journal, Tags and Trash, using the same single-line rows as boards with different icons. System is a sibling root row with a layers icon, the same typography and leading disclosure as the mother whiteboard. Clicking its label or disclosure collapses it; children align with child-board icons. Drag a system entry into Boards to keep its shortcut there; use its menu to move it back. Boards reorder among siblings without moving their folders. Alt+Up/Down also changes navigation order.

System entries can be starred and appear in Recent. Their menus offer navigation, starring, moving the shortcut between sections, and a link to their settings page. Templates and Slipbox open searchable tables; Journal includes Calendar and a searchable note table. Tags lists tag definitions. Trash lists archived cards and offers Restore. Template rows can create a new card from the template. Ordinary cards open in the shared popup and can be dragged onto a board.

Settings groups general pages above a Core plugins divider. Templates, Journal and Calendar, Tags, and Views and queries each have an Enable switch in their own page. Slipbox and Trash are required; their folders are configured in Files and folders. Disabling a feature hides its entry and related controls, retaining its navigation placement, settings and files. Calendar and Tags dock placements return when enabled. Disabled view blocks display their YAML source. Cards remain indexed for Search, Recent and the file explorer.

Special roles follow the configured Templates, new-card and Journal folder paths. Tags defaults to `tags/`; Trash defaults to `.heavens-door/trash/`. Both paths are configurable. Folder changes select a storage location; existing files stay at their current paths. These folders and their descendants do not appear as whiteboards, including when a feature is disabled. Existing `.whiteboard` files are retained but are not used for automatic card intake. The file explorer always shows the real files. Inbox remains reserved for Read later; Slipbox is the default for unplaced cards.

## Local files

Feature switches and navigation stay in `.heavens-door/settings.json`:

```json
{
  "features": { "journal": false },
  "boardNavigation": {
    "order": {
      "boards:": ["board:Projects", "system:slipbox", "board:Research"],
      "boards:Projects": ["board:Projects/Active", "board:Projects/Archive"],
      "system": ["system:templates", "system:tags", "system:trash"]
    },
    "systemCollapsed": false
  }
}
```

Missing plugin switches mean enabled. Slipbox and Trash remain enabled even in older settings that disabled them. New boards append after saved entries. Missing board keys are ignored. System keys identify roles, so folder changes do not break shortcuts.

Deleted cards keep their exact Markdown bytes in `<trash folder>/<uuid>.md`. A sibling `<uuid>.json` stores the original path and deletion timestamp. Restore returns the file to its original location, choosing a numbered filename if that path is occupied. Old trash without metadata restores into the configured Slipbox folder. Deletion and restoration use the normal undoable multi-file transaction. No card or tag content depends on the database for recovery.

Folder settings are editable inputs with fuzzy path search. An unmatched path can be saved before the folder exists; the feature creates it when first used. Create folder in the picker makes it immediately without adding a whiteboard. Journal template pickers search all Markdown notes, prioritizing the selected Templates folder. New template creates a daily or weekly starter in that folder and selects it for the journal. File explorer offers New folder and New file. A new folder has no `.whiteboard`; file names default to `.md` and accept another extension.

## File operations

The file explorer offers Copy, Cut, Paste, Duplicate, Rename and Move to Trash for files and folders. Its clipboard belongs to the current workspace. Cmd/Ctrl+C, X and V work on focused rows; F2 renames; Delete (or Cmd+Backspace on macOS) moves the item to Trash. Paste and Duplicate choose a numbered name when needed. Rename and Cut/Paste keep card IDs and rebase conventional Markdown/HTML links, board references and configured folder paths. Copies give valid Markdown cards new IDs and remap copied board placements; other files retain their exact bytes. Symbolic links, the root whiteboard metadata, Git internals and app internals cannot be moved or deleted.

General files and whole folders use the configured app Trash. `<trash folder>/<uuid>.json` records the original path, name, kind and deletion date. `<trash folder>/<uuid>.trash/<original name>` holds the original file or folder, including binary attachments. Trash offers Restore; it creates missing parent folders and avoids overwriting occupied paths. Copy, moves, deletion and restore support undo/redo. Undo refuses to replace externally changed data. A journal in the rebuildable cache lets interrupted moves roll back without losing source files.

## Journal navigation

Settings → Journal and Calendar → Reuse a journal split is optional and off by default. When enabled, ordinary journal opens from Calendar, Search, Recent or Explorer use one dedicated Main Dock split. The first open creates it using the configured split direction; later daily and weekly notes replace its journal tab and retain Back/Forward history. The split and tab identity are stored with the workspace layout, survive reopening, and follow tab moves. Closing the journal tab leaves a reusable slot when its split still contains other tabs. Closing the last tab removes that split; the next journal open creates a new dedicated split. Explicit Open in new tab or another Tab Group still follows that command. The feature guide is not treated as a journal note.

A journal note’s breadcrumb links its configured Journal folder to the Journal page, including custom nested folders. Disabling Journal restores ordinary folder navigation.
