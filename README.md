# Heaven’s Door

An early desktop workspace for local Markdown cards and whiteboards.

## Run

Install Node.js 24.21+ and Git, then:

```sh
npm ci
npm run build
npm start
```

For development, `npm run dev` starts Vite and Electron. Renderer edits reload automatically; restart the command after changing the main process or workspace worker.

Choose **Try a sample workspace** to explore without opening your own notes. **Open workspace** opens a real folder; the app writes edits directly to it. The sample workspace is temporary.

## Using the preview

- Click inside a whiteboard card to edit it in place. Drag its header to move it; text remains selectable. Escape or clicking empty canvas finishes editing. Clicking a card in Explorer opens its full-page editor. Edits save after a short pause. Frontmatter stays hidden.
- Drag a card’s header to move it, or its lower-right handle to resize it. Navigation follows the Obsidian whiteboard plugin: mouse wheel zooms at the pointer; two-finger trackpad scrolling pans; pinch zooms. Middle-drag or Space + left-drag pans; right-drag pans from empty canvas. Left-drag on empty canvas selects a region. Shift-click adds cards and Cmd/Ctrl-click toggles them; drag a selected card’s header to move the group.
- Scrollable card content consumes wheel input while it can scroll in that direction. At its boundary the board handles the wheel. Zoom supports 20–300%, editable percentage, Cmd/Ctrl + `+`/`-`, `0` for 100%, and `1` to fit. Distant cards use simplified previews.
- Select one card and **Connect**, then select another. **Remove reference** removes a reference to a card from another folder and its connections. Direct-child cards always belong to their folder’s board. The Markdown file remains.
- Use the header chevron to collapse or expand a card. Collapsed cards show their first H1 (filename fallback). Notes created in Explorer or by another app appear collapsed in a persistent column to the right of existing content. Cards created on the canvas open at the chosen position.
- **View → Reload** (`Cmd/Ctrl+R`) saves pending edits and reopens the current workspace. Rendering errors show a recovery screen; Quit/Reload offer a native prompt if the renderer stops responding. Unsaved conflicts block normal reload so the draft can be copied or reconciled. Reload resets session undo; saved Git checkpoints remain.
- Show formatting controls with **Aa**, then use **Link card** to insert a stable link. Backlinks appear below the editor. That panel also places a reference on another whiteboard.
- Use the top-right search button to search card names and contents. `backlinks:<card-id>` also works. The file list displays actual filenames.
- ⌘Z / Ctrl+Z and ⇧⌘Z / Ctrl+Shift+Z undo or redo card and board changes in one chronological session history. Typing close together is grouped.
- ⌘S / Ctrl+S saves a workspace Git checkpoint. The app also checkpoints after five idle minutes. Select a checkpoint in **History** to restore the whole workspace. Later checkpoints remain reachable; new edits continue on a new branch.
- Change the default `untitled` filename base in **Workspace settings**. Headings and filenames are independent.
- Explorer, Starred and Recent open files in the active pane. Reopening a file selects its existing tab. Use the pane dropdown to split right or down; the same file may be open in several panes, with independent scroll/zoom positions and shared edits. Drag tabs between panes. Open tabs, splits and view positions are saved in the workspace and restored when it reopens. Existing windows keep independent document panes.
- **File → New Window** opens another workspace; **New Window for This Workspace** shares the current one. Workspace windows share one index/write queue; conflicting concurrent drafts remain recoverable. Appearance, default filenames, starred/recent entries and icons are stored in that workspace's `.heavens-door/settings.json`. Change an icon from the document breadcrumb. Root migration requires other windows for that workspace to be closed.

## Side docks and navigation

The activity bar on the far left reveals modules wherever they are placed. Both side docks can collapse, contain vertically stacked panel groups, and host several module tabs per group. Drag a module tab or a group's grip to rearrange them; use the group's **…** menu for move/split/merge actions without dragging. Resize between groups with the horizontal splitter. Dock arrangements are workspace-owned and shared across that workspace's windows. **Workspace settings → Reset side docks** restores defaults.

The status bar contains workspace switching on the left and sync/save/checkpoint status on the right. Undo and redo remain keyboard actions.


The bottom-left workspace switcher lists registered workspaces with the current one checked. Selecting another opens it in the same window after saving pending edits. **Manage workspaces** sits below a divider; removing a registration keeps its files. **Whiteboard explorer** and **File explorer** are separate module tabs; File explorer includes attachments and hidden files. Folder rows show **+** on hover for a sub-whiteboard or note. **…** and right-click use the same menu.

Drag a file from Explorer or Recent into Starred to bookmark it. Drag within Starred to reorder; drag out to remove the bookmark without touching the file. Escape cancels. Alt+Up/Down and the context menu offer keyboard reordering. Recent remains chronological. Both lists share one scroller; an empty Starred header is still a drop target.

Change a document icon from its breadcrumb or context menu. Lucide supplies the standard icons; the searchable Emoji Mart picker works offline. Hover controls or focus them with the keyboard for tooltips.

Physical-file mode opens indexed notes/boards/tags normally, images as previews, and text as read-only source (up to 2 MiB). PDFs and other binaries can be revealed in the system file manager. It does not yet rename, delete or move files.

## Developer documentation

- [Codebase architecture](docs/architecture.md)
- [UI terminology and workspace layout](docs/ui-terminology.md)
- [Design system](docs/design-system.md)
- [Whiteboard folders, membership and collapsed cards](docs/whiteboards.md)
- [Sortable-list and bookmark drag specification](docs/interactions/drag-and-drop.md)

## Files and safeguards

Cards are `.md` files with a UUID in YAML `card-id` frontmatter. Existing frontmatter is preserved. Imported notes without an ID receive one when edited; until then their provisional identity depends on their path. Persistent card links use `[label](card:UUID)`.

A `.whiteboard` file contains readable Markdown membership links and a versioned JSON layout in a comment block. This is a new, smaller schema inspired by the Obsidian plugin, not a directly compatible copy of its version-2 format. Each placement has its own identity, separate from its card. A folder is a whiteboard only when it contains a valid file with the same basename, such as `Ideas/Ideas.whiteboard`; creating a sub-whiteboard creates that folder and matching file. Every direct `.md` child appears on it, including externally created notes. The root metadata file is `<workspace-name>.whiteboard`. Ordinary asset folders stay ordinary folders. Subfolder placements use readable `board:` links. The workspace root shows only sub-whiteboards. For older workspaces with root cards, **Organize root cards** reviews a migration into `Notes` (or a numbered free name), keeps card identities, and saves recovery data before moving files. Path-based incoming links and unsupported root-card markup stop migration for manual attention. Opening a workspace creates missing mother-board metadata and reconciles membership, but never moves existing notes automatically. Obsidian plugin board imports are not implemented.

SQLite is a rebuildable index stored in the application’s user-data directory, outside the notes folder. Startup verifies content hashes and reuses unchanged index entries. A filesystem watcher updates changed files; board previews load only visible card bodies. Changes made outside the app appear automatically.

Saves check the last observed file revision before writing. A conflicting draft stays in the editor with **Copy draft** and **Reload from disk** actions. Grouped writes keep recovery copies outside the workspace until completed. If recovery encounters another external edit, it stops and retains the recovery file. There is still a small check-to-replace race with another program writing the same file; this preview is not simultaneous collaborative editing.

For a folder outside an existing repository, the app initializes a local Git repository and marks it as app-managed. Existing repositories are not adopted automatically. App history pauses if there are staged changes or an unfinished Git operation. Checkpoints include the workspace’s non-ignored files, including attachments. Nothing is pushed or synced. Automatic pruning is disabled; the history panel currently shows the latest 200 reachable checkpoints.

Basic headings, emphasis, lists, checklists, quotes, code, tables, links and local images are supported. Opening a card alone does not rewrite it. Raw HTML, wiki links, footnotes and math stay read-only to avoid losing unsupported content. Ordinary Markdown formatting may normalize on editing. Remote images are not fetched. The formatted editor has not yet been exhaustively tested across Markdown dialects or IME input methods.

## Checks

```sh
npm run check       # lint, types, file/history/editor checks, production build
npm run benchmark   # temporary 10,000-card vault; removed afterward
```

This first slice targets macOS, Windows and Ubuntu through Electron; desktop interaction has been exercised on macOS. It is not yet a packaged or signed release. Existing `.tag` files open read-only table and Kanban views of cards whose frontmatter `tags` includes that tag. Property editing and Kanban writeback, rich history graphs/cherry-picking, AI integrations, reading workflows, sync, and the community plugin/theme API are not implemented in this preview.

Navigation code adapted from the user’s MIT-licensed Obsidian whiteboard plugin is attributed in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
