# Heaven’s Door

An early desktop workspace for local Markdown cards and whiteboards.

## Install and release

The packaged app is **Heaven's Door 0.1.271**. Build installers with `npm run package:mac -- --arm64` or `npm run package:win -- --x64`; outputs are in `release/`. See [packaging, version bumps and Apple signing](docs/releases.md) for the GitHub Actions draft-release workflow and update setup.

## Run

Install Node.js 24.21+ and Git 2.38+ (for applying checkpoint changes), then:

```sh
npm ci
npm run build
npm start
```

For development, `npm run dev` starts Vite and Electron. Renderer edits reload automatically; restart the command after changing the main process or workspace worker.

Choose **Try a sample workspace** to explore without opening your own notes. **Open workspace** opens a real folder; the app writes edits directly to it. Sample workspaces are saved under `Documents/Heaven's Door/Sample workspaces` and remain available after restarting the computer.

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
- Only selected cards scroll their content; otherwise wheel input navigates the board. Selected scrollable content keeps the wheel at its boundaries; pinch always zooms. The icon beside zoom cycles **Auto → Mouse → Trackpad** and remembers the choice for this workspace. Auto detects recent input and keeps pan or zoom consistent through each gesture; Mouse always zooms with the wheel; Trackpad scrolls to pan and pinches to zoom. Zoom supports 20–300%, Cmd/Ctrl + `+`/`-`, `0` for 100%, and `1` to fit. Click the percentage to **Zoom to fit**. Expanded cards keep their formatted previews at every zoom level.
- Whiteboard tiles show a compact preview of their contents. Double-click a tile or click its corner arrow to open it. Selected items sit above unselected items; moving/resizing items stay on top during the gesture.
- Select a card or whiteboard tile to show its four anchors. Drag between anchors, or click two anchors, to draw a curved **edge**. Drag selected endpoints to reconnect; Escape cancels. **Style** in the Action Ribbon opens shared appearance controls. Passive **mention links** show references from card content and can be hidden in Style View when nothing is selected. **Remove reference** removes a placement and its edges; the Markdown file remains. Direct-child cards always belong to their folder’s board.
- Use the floating upper-right chevron to collapse a card; the collapsed title row has an expand chevron. Collapsed cards retain the same leading H1, typography and chevron position. Long titles keep their wrapping. Notes created in Explorer or by another app appear collapsed in a persistent column to the right of existing content. Cards created on the canvas open at the chosen position.
- **View → Reload** (`Cmd/Ctrl+R`) saves pending edits and reopens the current workspace. Rendering errors show a recovery screen; Quit/Reload offer a native prompt if the renderer stops responding. Unsaved conflicts block normal reload so the draft can be copied or reconciled. Reload resets session undo; saved Git checkpoints remain.
- Select text, then use **Link to another card** in the floating toolbar to insert a stable link. Backlinks appear below the editor. That panel also places a reference on another whiteboard.
- Open Search with the top-right button or **⌘K / Ctrl+K**. Search filenames, titles and content with English typo tolerance and Traditional/Simplified Chinese matching. Results keep the original text. Arrow keys select results; Enter opens one; ⌘Enter / Ctrl+Enter opens it beside the current Tab Group. Search is also a Side Dock View. `backlinks:<card-id>` lists incoming mentions.
- ⌘Z / Ctrl+Z and ⇧⌘Z / Ctrl+Shift+Z undo or redo card and board changes in one chronological session history. Typing close together is grouped.
- ⌘S / Ctrl+S saves a workspace Git checkpoint. The app also checkpoints after five idle minutes. Single-click a checkpoint card in **History** to inspect its changed files. Double-click or use **Go to checkpoint** in its context menu to navigate after confirmation. Current work is saved first; tabs, layout and later checkpoints remain. Drag a checkpoint onto a diverged branch checkpoint to apply its changes as a new child; the original stays recoverable. Conflicts stop without changing live notes. Close other windows for this workspace before history navigation. See [Search and History](docs/search-and-history.md).
- Every card reserves a leading H1 in the app. Empty titles show the gray **A new card** prompt; click and type to replace it directly. The prompt is never saved into Markdown. **Settings → Workspace → Empty card title** customizes it. Cards without a leading H1 retain their existing body until you edit.
- Change the default `untitled` filename base in **Settings → Workspace**. Headings and filenames are independent.
- Explorer, Starred and Recent open files in the active Main Dock Tab Group. Reopening a file selects its existing tab. Use the group dropdown (**Tab Group actions**) to split right or down; the same file may be open in several Tab Groups, with independent scroll/zoom positions and shared edits. Drag tabs between groups. Open tabs, splits and view positions are saved in the workspace and restored when it reopens. Existing windows keep independent Main Dock Tab Groups.
- **File → New window** opens another workspace; **New window for this workspace** shares the current one. Workspace windows share one index/write queue; conflicting concurrent drafts remain recoverable. Appearance, default filenames, starred/recent entries and icons are stored in that workspace's `.heavens-door/settings.json`. Change an icon from the document breadcrumb. Root migration requires other windows for that workspace to be closed.

## Docks and navigation

The **Main Dock** holds Whiteboard View, Card View and other content views in tabs and splits. **Left Side Dock** and **Right Side Dock** hold supporting Views. A **Workspace** is the local folder together with its settings and saved interface layout. See the [terminology guide](docs/ui-terminology.md) for definitions.

The **Action Ribbon** on the far left contains actions. Its View actions reveal Views wherever they are placed in the Side Docks. Both Side Docks can collapse, contain vertically stacked Tab Groups, and host several tabs per group. Drag a Side Dock tab onto another Tab Strip to rearrange Views. Drag around a Tab Group’s vertical midpoint to preview a horizontal divider and create a new group below. Right-click a tab for close/move/split/merge actions without dragging. Resize between groups with the horizontal splitter. Dock arrangements are workspace-owned and shared across that workspace's windows. **Settings → Navigation → Reset layout** restores defaults.

The status bar contains workspace switching on the left and sync/save/checkpoint status on the right. Undo and redo remain keyboard actions.


The bottom-left workspace switcher lists registered workspaces with the current one checked. Selecting another opens it in the same window after saving pending edits. **Manage workspaces** sits below a divider and is also available on the welcome screen. It lists each folder’s availability and last-updated time; missing folders stay listed but cannot be opened. Refresh checks the folders again. The timestamp is the latest file/folder modification, excluding Git internals, and is retained when a folder becomes unavailable (**Unknown** if never recorded). Removing a registration keeps its files. **Whiteboard explorer** and **File explorer** are separate Views; File explorer includes attachments and hidden files. Folder rows show **+** on hover for **New whiteboard** or **New card**. **…** and right-click use the same menu.

Drag a file from Explorer or Recent into Starred to bookmark it. Drag within Starred to reorder; drag out to remove the bookmark without touching the file. Escape cancels. Alt+Up/Down and the context menu offer keyboard reordering. Recent remains chronological. Both lists share one scroller; an empty Starred header is still a drop target.

Change a document icon from its breadcrumb or context menu. Lucide supplies the standard icons; the searchable Emoji Mart picker works offline. Hover controls for tooltips. Icon buttons retain accessible names for keyboard and assistive-technology users.

Physical-file mode opens indexed notes/boards/tags normally, images as previews, and text as read-only source (up to 2 MiB). PDFs and other binaries can be revealed in the system file manager. It does not yet rename, delete or move files.

## Developer documentation

- [Tags, property storage and editable views](docs/tags.md)
- [Codebase architecture](docs/architecture.md)
- [UI terminology and workspace layout](docs/ui-terminology.md)
- [Design system](docs/design-system.md)
- [UI text catalogs and copy review](docs/ui-text.md)
- [Whiteboard folders, membership and collapsed cards](docs/whiteboards.md)
- [Shared drag-and-drop specification](docs/interactions/drag-and-drop.md)
- [Menu and tooltip interaction guideline](docs/interactions/menus-and-tooltips.md)

## Files and safeguards

Cards are `.md` files with a UUID in YAML `card-id` frontmatter. Existing frontmatter is preserved. Imported notes without an ID receive one when edited; until then their provisional identity depends on their path. Persistent card links use `[label](card:UUID)`.

A `.whiteboard` file contains readable Markdown membership links and a versioned JSON layout in a comment block. This is a new, smaller schema inspired by the Obsidian plugin, not a directly compatible copy of its version-2 format. Each placement has its own identity, separate from its card. A folder is a whiteboard only when it contains a valid file with the same basename, such as `Ideas/Ideas.whiteboard`; creating a sub-whiteboard creates that folder and matching file. Every direct `.md` child appears on it, including externally created notes. The root metadata file is `<workspace-name>.whiteboard`. Ordinary asset folders stay ordinary folders. Subfolder placements use readable `board:` links. The workspace root shows only sub-whiteboards. For older workspaces with root cards, **Organize root cards** reviews a migration into `Notes` (or a numbered free name), keeps card identities, and saves recovery data before moving files. Path-based incoming links and unsupported root-card markup stop migration for manual attention. Opening a workspace creates missing mother-board metadata and reconciles membership, but never moves existing notes automatically. Obsidian plugin board imports are not implemented.

SQLite is a rebuildable index stored in the application’s user-data directory, outside the notes folder. Startup verifies content hashes and reuses unchanged index entries. A filesystem watcher updates changed files; board previews load only visible card bodies. Changes made outside the app appear automatically.

Saves check the last observed file revision before writing. A conflicting draft stays in the editor with **Copy draft** and **Reload from disk** actions. Grouped writes keep recovery copies outside the workspace until completed. If recovery encounters another external edit, it stops and retains the recovery file. There is still a small check-to-replace race with another program writing the same file; this preview is not simultaneous collaborative editing.

For a folder outside an existing repository, the app initializes a local Git repository and marks it as app-managed. Existing repositories are not adopted automatically. App history pauses if there are staged changes or an unfinished Git operation. Checkpoints include the workspace’s non-ignored files, including attachments. Nothing is pushed or synced. Automatic pruning is disabled; the history panel currently shows the latest 200 reachable checkpoints.

Basic headings, emphasis, lists, checklists, quotes, code, tables, links and local images are supported. Opening a card alone does not rewrite it. HTML renders with source editing; colors, highlights and local images have visual controls. Unrelated footnotes stay in protected preview to avoid losing unsupported content; annotations have an editable right-side rail. Ordinary Markdown formatting may normalize on editing. Remote images are not fetched. The formatted editor has not yet been exhaustively tested across Markdown dialects or IME input methods.

## Checks

```sh
npm run check       # lint, types, file/history/editor checks, production build
npm run benchmark   # temporary 10,000-card vault; removed afterward
```

This first slice targets macOS, Windows and Ubuntu through Electron; desktop interaction has been exercised on macOS. It is not yet a packaged or signed release. Existing `.tag` files open read-only table and Kanban views of cards whose frontmatter `tags` includes that tag. Property editing and Kanban writeback, rich history graphs/cherry-picking, AI integrations, reading workflows, sync, and the community plugin/theme API are not implemented in this preview.

Navigation code adapted from the user’s MIT-licensed Obsidian whiteboard plugin is attributed in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

### Performance and Developer settings

Open the Action Ribbon’s **Settings** button. **Performance → Hardware acceleration** is On by default and applies to all windows and workspaces on this computer. Turn it off to troubleshoot graphics/driver issues. After changing it, fully quit and reopen the app; **View → Reload** cannot apply graphics startup changes. Returning the switch to its startup value cancels the restart notice.

This device preference is stored in `app-settings.json` in Electron’s application user-data directory, outside every workspace and its Git history. Workspace appearance and layout remain in `.heavens-door/settings.json`.

Expand **Developer → Graphics diagnostics** to inspect hardware acceleration in the running session, Chromium/Electron versions and graphics feature status. Diagnostics load only when opened or explicitly refreshed, with no background polling. A pending preference can differ from the running status until restart; On requests acceleration but the graphics driver may still fall back to software.

### View blocks and feature settings

Settings now has a searchable sidebar with separate feature pages. **Views and queries** controls merging equally named properties in pickers (On by default) and case-sensitive name matching (Off by default). Stored namespaced keys remain unchanged.

Use **Add block → Add view block** beside a card content block, or **Add view block** in a tag page. One file-backed YAML query can feed multiple named Table, Kanban, Gallery and Timeline views, each with its own additional filter. Results open their source cards; Table cells and Kanban/Timeline moves can edit source properties. See the [view-block file format and usage](docs/view-blocks.md).

The card editor supports source mode, contextual block moves and styling, configurable slash commands, symbols/emoji, and portable HTML image layouts with captions, crops and rows. See [Editor storage and controls](docs/editor.md).


### Reading material and board objects

**System → Read later** imports PDF/HTML files or captures webpages into Inbox. Source files and article images remain local; Markdown wrappers hold reading progress, highlights and notes. PDFs use a continuous reader and first-page board preview. The library supports New/Reading/Done states, OPML and local RSS. The optional Chrome capture extension has a paired loopback receiver and an offline queue.

Boards also support standalone images, plain text and simple text shapes. They share selection, movement, connectors, undo and transfers. See [Attachments, annotations and reading](docs/attachments-and-reading.md) for controls, storage and testing limits, and [Chrome capture setup](extensions/chrome/README.md).

Whiteboard Text supports compact in-place editing, connected creation from an unfinished arrow, Tab/Enter child/sibling creation directly while editing, Alt+Enter line breaks, and conversion into ordinary Markdown cards. Defaults live under Settings → Whiteboard → Text. See [Text interactions](docs/interactions/topics.md).
