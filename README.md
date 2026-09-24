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

Choose **Try a sample workspace** to explore without opening your own notes. **Open a notes folder** opens a real folder; the app writes edits directly to it. The sample workspace is temporary.

## Using the preview

- Create a card, then write in the formatted editor. Edits save after a short pause. Frontmatter stays hidden.
- Drag a card to move it, or its lower-right handle to resize it. Navigation follows the Obsidian whiteboard plugin: mouse wheel zooms at the pointer; two-finger trackpad scrolling pans; pinch zooms. Middle-drag or Space + left-drag pans; right-drag pans from empty canvas. Left-drag on empty canvas selects a region. Shift-click adds cards and Cmd/Ctrl-click toggles them; drag a selected card to move the group.
- Scrollable card content consumes wheel input while it can scroll in that direction. At its boundary the board handles the wheel. Zoom supports 20–300%, editable percentage, Cmd/Ctrl + `+`/`-`, `0` for 100%, and `1` to fit. Distant cards use simplified previews.
- Select one card and **Connect**, then select another. **Remove placement** removes only that board placement and its connections. The Markdown file remains.
- Use the editor’s **Link card** menu to insert a stable link. Backlinks appear below the editor. A card that is not on the current board can be placed there from that panel.
- Search card names and contents in the sidebar. `backlinks:<card-id>` also works. The file list displays actual filenames.
- ⌘Z / Ctrl+Z and ⇧⌘Z / Ctrl+Shift+Z undo or redo card and board changes in one chronological session history. Typing close together is grouped.
- ⌘S / Ctrl+S saves a workspace Git checkpoint. The app also checkpoints after five idle minutes. Select a checkpoint in **History** to restore the whole workspace. Later checkpoints remain reachable; new edits continue on a new branch.
- Change the default `untitled` filename base in **Workspace settings**. Headings and filenames are independent.

## Files and safeguards

Cards are `.md` files with a UUID in YAML `card-id` frontmatter. Existing frontmatter is preserved. Imported notes without an ID receive one when edited; until then their provisional identity depends on their path. Persistent card links use `[label](card:UUID)`.

A `.whiteboard` file contains readable Markdown membership links and a versioned JSON layout in a comment block. This is a new, smaller schema inspired by the Obsidian plugin, not a directly compatible copy of its version-2 format. Each placement has its own identity, separate from its card. A folder gets a board when its first card is created in the app. Existing folders and boards appear when opened; this preview does not yet create folders or migrate Obsidian plugin boards.

SQLite is a rebuildable index stored in the application’s user-data directory, outside the notes folder. Startup verifies content hashes and reuses unchanged index entries. A filesystem watcher updates changed files; board previews load only visible card bodies. Changes made outside the app appear automatically.

Saves check the last observed file revision before writing. A conflicting draft stays in the editor with **Copy draft** and **Reload from disk** actions. Grouped writes keep recovery copies outside the workspace until completed. If recovery encounters another external edit, it stops and retains the recovery file. There is still a small check-to-replace race with another program writing the same file; this preview is not simultaneous collaborative editing.

For a folder outside an existing repository, the app initializes a local Git repository and marks it as app-managed. Existing repositories are not adopted automatically. App history pauses if there are staged changes or an unfinished Git operation. Checkpoints include the workspace’s non-ignored files, including attachments. Nothing is pushed or synced. Automatic pruning is disabled; the history panel currently shows the latest 200 reachable checkpoints.

Basic headings, emphasis, lists, checklists, quotes, code, tables, links and local images are supported. Opening a card alone does not rewrite it. Raw HTML, wiki links, footnotes and math stay read-only to avoid losing unsupported content. Ordinary Markdown formatting may normalize on editing. Remote images are not fetched. The formatted editor has not yet been exhaustively tested across Markdown dialects or IME input methods.

## Checks

```sh
npm run check       # lint, types, file/history/editor checks, production build
npm run benchmark   # temporary 10,000-card vault; removed afterward
```

This first slice targets macOS, Windows and Ubuntu through Electron; desktop interaction has been exercised on macOS. It is not yet a packaged or signed release. Tags and property views, rich history graphs/cherry-picking, AI integrations, reading workflows, sync, and the community plugin/theme API are not implemented in this preview.

Navigation code adapted from the user’s MIT-licensed Obsidian whiteboard plugin is attributed in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
