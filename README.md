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

## Rebuild and reopen after code changes

Run these commands in the repository folder containing `package.json`.

1. Wait for **Saved** in the status bar, then quit the app completely: **Cmd+Q** on macOS, or close all app windows on Windows/Ubuntu. Close any other copy of Heaven’s Door launched from this repository too.
2. If you were using `npm run dev`, stop that command in its terminal after quitting the app. A running development window reads from Vite, not the production build.
3. Build, then reopen:

   ```sh
   npm run build && npm start
   ```

   This starts the app only if the build succeeds. In Windows PowerShell 5, run the two commands separately and start only after a successful build. Run `npm ci` first on a fresh checkout or when `package-lock.json` changes; it is not needed for ordinary UI edits.
4. Choose your existing workspace from the welcome screen, or use **Open workspace** to select its folder.

**View → Reload** refreshes the current window; it does not rebuild source code or restart the main process and workspace workers. **`npm start`** launches the last files built in `dist/`; it does not build them. Use the full quit/build/start sequence when testing new changes.

### Reload or Quit is blocked after closing a View

If you rebuilt while the app was running and now see **Missing workspace module** after closing a Side Dock View, the new UI may be talking to an older workspace worker. The failed layout save also blocks Reload and Quit.

Reopen the closed Views from the **Action Ribbon**, then quit normally so pending changes can save. Rebuild and reopen using the steps above. You can close those Views again after restarting. Reload alone cannot update the running worker.

### Clean rebuild if the app still looks outdated

Quit all running copies and stop the development server first. From the repository folder, remove the generated build output and rebuild:

```sh
node -e "require('node:fs').rmSync('dist', { recursive: true, force: true })"
npm run build && npm start
```

Only `dist/` is removed. Your workspace notes, `.heavens-door` settings, and Git history are retained. There is no need to delete workspace data or Electron’s application-data directory to rebuild. If the UI still looks old, check that the terminal is in the intended checkout (`pwd` on macOS/Ubuntu, `Get-Location` in PowerShell) and that you reopened the newly launched window.

## Using the preview

- Click and release inside a whiteboard card to edit it in place. Press and drag its preview to move it; once editing, dragging text selects it. Escape or clicking empty canvas finishes editing. Clicking a card in Explorer opens its Card View in the Main Dock. Edits save after a short pause. Frontmatter stays hidden.
- Drag a card’s preview or border/padding, or a whiteboard tile’s body, to move it. Both use the same lower-right L-shaped resize handle. Navigation follows the Obsidian whiteboard plugin: mouse wheel zooms at the pointer; two-finger trackpad scrolling pans; pinch zooms. Middle-drag or Space + left-drag pans; right-drag pans from empty canvas. Left-drag on empty canvas selects a region. Shift-click adds cards and Cmd/Ctrl-click toggles them; drag a selected card’s preview or outer padding to move the group.
- Only selected cards scroll their content; otherwise wheel input navigates the board. At a selected card’s scroll boundary the board handles the wheel; pinch always zooms. Zoom supports 20–300%, Cmd/Ctrl + `+`/`-`, `0` for 100%, and `1` to fit. Click the percentage to **Zoom to fit**. Expanded cards keep their formatted previews at every zoom level.
- Whiteboard tiles show a compact preview of their contents. Double-click a tile or click its corner arrow to open it. Selected items sit above unselected items; moving/resizing items stay on top during the gesture.
- Select one card and **Connect**, then select another. **Remove reference** removes a reference to a card from another folder and its connections. Direct-child cards always belong to their folder’s board. The Markdown file remains.
- Use the floating upper-right chevron to collapse a card; the collapsed title row has an expand chevron. Collapsed cards retain the same leading H1, typography and chevron position. Long titles keep their wrapping. Notes created in Explorer or by another app appear collapsed in a persistent column to the right of existing content. Cards created on the canvas open at the chosen position.
- **View → Reload** (`Cmd/Ctrl+R`) saves pending edits and reopens the current workspace. Rendering errors show a recovery screen; Quit/Reload offer a native prompt if the renderer stops responding. Unsaved conflicts block normal reload so the draft can be copied or reconciled. Reload resets session undo; saved Git checkpoints remain.
- Show formatting controls with **Aa**, then use **Link card** to insert a stable link. Backlinks appear below the editor. That panel also places a reference on another whiteboard.
- Use the top-right search button to search card names and contents. `backlinks:<card-id>` also works. The file list displays actual filenames.
- ⌘Z / Ctrl+Z and ⇧⌘Z / Ctrl+Shift+Z undo or redo card and board changes in one chronological session history. Typing close together is grouped.
- ⌘S / Ctrl+S saves a workspace Git checkpoint. The app also checkpoints after five idle minutes. Select a checkpoint in **History** to restore the whole workspace. Later checkpoints remain reachable; new edits continue on a new branch.
- Every card reserves a leading H1 in the app. Empty titles show the gray **A new card** prompt; click and type to replace it directly. The prompt is never saved into Markdown. **Workspace settings → Empty card title** customizes it. Cards without a leading H1 retain their existing body until you edit.
- Change the default `untitled` filename base in **Workspace settings**. Headings and filenames are independent.
- Explorer, Starred and Recent open files in the active Main Dock Tab Group. Reopening a file selects its existing tab. Use the group dropdown (currently labelled **Pane actions**) to split right or down; the same file may be open in several Tab Groups, with independent scroll/zoom positions and shared edits. Drag tabs between groups. Open tabs, splits and view positions are saved in the workspace and restored when it reopens. Existing windows keep independent Main Dock Tab Groups.
- **File → New Window** opens another workspace; **New Window for This Workspace** shares the current one. Workspace windows share one index/write queue; conflicting concurrent drafts remain recoverable. Appearance, default filenames, starred/recent entries and icons are stored in that workspace's `.heavens-door/settings.json`. Change an icon from the document breadcrumb. Root migration requires other windows for that workspace to be closed.

## Docks and navigation

The **Main Dock** holds Whiteboard View, Card View and other content views in tabs and splits. **Left Side Dock** and **Right Side Dock** hold supporting Views. A **Workspace** is the local folder together with its settings and saved interface layout. See the [terminology guide](docs/ui-terminology.md) for definitions.

The **Action Ribbon** on the far left contains actions. Its View actions reveal Views wherever they are placed in the Side Docks. Both Side Docks can collapse, contain vertically stacked Tab Groups, and host several tabs per group. Drag a Side Dock tab onto another Tab Strip to rearrange Views. Drag around a Tab Group’s vertical midpoint to preview a horizontal divider and create a new group below. Right-click a tab for close/move/split/merge actions without dragging. Resize between groups with the horizontal splitter. Dock arrangements are workspace-owned and shared across that workspace's windows. **Workspace settings → Reset side docks** restores defaults.

The status bar contains workspace switching on the left and sync/save/checkpoint status on the right. Undo and redo remain keyboard actions.


The bottom-left workspace switcher lists registered workspaces with the current one checked. Selecting another opens it in the same window after saving pending edits. **Manage workspaces** sits below a divider; removing a registration keeps its files. **Whiteboard explorer** and **File explorer** are separate Views; File explorer includes attachments and hidden files. Folder rows show **+** on hover for **New whiteboard** or **New note**. **…** and right-click use the same menu.

Drag a file from Explorer or Recent into Starred to bookmark it. Drag within Starred to reorder; drag out to remove the bookmark without touching the file. Escape cancels. Alt+Up/Down and the context menu offer keyboard reordering. Recent remains chronological. Both lists share one scroller; an empty Starred header is still a drop target.

Change a document icon from its breadcrumb or context menu. Lucide supplies the standard icons; the searchable Emoji Mart picker works offline. Hover controls for tooltips. Icon buttons retain accessible names for keyboard and assistive-technology users.

Physical-file mode opens indexed notes/boards/tags normally, images as previews, and text as read-only source (up to 2 MiB). PDFs and other binaries can be revealed in the system file manager. It does not yet rename, delete or move files.

## Developer documentation

- [Codebase architecture](docs/architecture.md)
- [UI terminology and workspace layout](docs/ui-terminology.md)
- [Design system](docs/design-system.md)
- [Whiteboard folders, membership and collapsed cards](docs/whiteboards.md)
- [Shared drag-and-drop specification](docs/interactions/drag-and-drop.md)
- [Menu and tooltip interaction guideline](docs/interactions/menus-and-tooltips.md)

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
