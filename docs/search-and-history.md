# Search and History

## Search behavior

Cmd/Ctrl+K opens the search dialog. The Action Ribbon's Search action reveals its Side Dock View. Both use the same results component: filename, relative path, readable original-text excerpt, arrow-key selection and Enter/click to show the card on its whiteboard. The owning folder’s whiteboard takes priority, then an existing reference; a card without a placement opens directly. Reveal selects and expands the placement and pans to it at the existing zoom without entering edit mode. Shift+Enter opens the card; Cmd/Ctrl+Enter opens the card beside the current Tab Group. These three actions are also available in the result context menu and as footer buttons with shortcut tooltips. IME composition does not open a result. Escape and clicking the backdrop dismiss the dialog.

MiniSearch runs in the workspace worker. It indexes filenames, leading titles and readable body text; titles/names receive more weight. English words of four or more characters support bounded typo matching; prefix search also works. Chinese character pairs support unspaced phrases and single-character searches. OpenCC canonicalizes Traditional/Simplified forms in the derived index; matching original-script titles/names receive an additional boost. Cross-script conversion is not semantic translation or pinyin search. Excerpts strip Markdown formatting and link destinations while retaining readable text. Match highlights map back to the original script. A small lazy-loaded local image preview appears under its containing card; raw assets are not independent search results. This does not perform OCR or image recognition. Derived preview text is cached for up to 200 result cards and invalidated on file changes. Missing/unsupported images are hidden without breaking results.

SQLite stores parsed metadata, properties and backlinks. Changed files update these and the text index through the same serialized refresh path. Rename/deletion removes stale entries. On reopening, the text index rebuilds from cached parsed cards, then file hashes reconcile changes. No query reads the whole workspace from disk. Startup loads the window shell before waiting for workspace indexing and shows indeterminate loading feedback. Queries announce busy state and show a spinner after 250 ms. Text indexing stays in worker memory; benchmark larger real workspaces before introducing another on-disk index format.

Default text search excludes frontmatter, link destinations, raw HTML attributes/comments and internal IDs. Whiteboard geometry lives in `.whiteboard` files and is not part of this card text index. Ordinary prose or code discussing positions/sizes remains searchable; exclusion follows structure, not a blacklist of words. Explicit property queries below are a separate opt-in path.

## Structured card queries

The typed bridge exposes a bounded read-only query for app features and future plugins:

```ts
const cards = await window.door.request<CardResult[]>({
  kind: 'queryCards',
  query: {
    text: '学习',
    folder: 'Research',
    recursive: true,
    tag: 'project',
    properties: [
      { field: 'status', op: 'eq', value: 'active' },
      { field: 'priority', op: 'gte', value: 2 },
    ],
    sort: 'title',
    direction: 'asc',
    limit: 50,
    offset: 0,
  },
});
```

Filters combine with AND. Folder is workspace-relative; recursive defaults false. Tag matches an exact scalar tag or member of the tags array. `backlinksTo` accepts a stable card ID. Property fields are exact top-level frontmatter keys. Operators: `eq`, `contains` (scalar or array member), `exists`, and numeric `gt/gte/lt/lte`. Equality preserves JSON types. Sort is name/title/path; without it, text results use relevance. Limits are 1–500, offset up to 100,000. Results include card metadata, parsed properties, snippet, score and matched terms, without full bodies.

SQL identifiers/operators are allowlisted, values are bound parameters, and malformed queries fail explicitly. This is a data/query foundation, not arbitrary SQL or a JavaScript plugin runtime. Tags and plugin lifecycle work are separate milestones.

## Checkpoints

Cmd/Ctrl+S flushes drafts and captures changed content. Five idle minutes after an app edit also trigger a checkpoint. Unchanged saves create no commit. Session undo remains separate from durable Git history.

A single click selects a checkpoint card and shows affected files with added/removed line counts. Double-click or **Go to checkpoint** asks for confirmation, saves current changes, and activates the chosen revision on a new branch. Existing branches remain available. There is no separate “return” action; navigate the graph. Loading earlier checkpoints is available up to 5,000 displayed nodes; no pruning runs automatically.

`.heavens-door/settings.json` stays outside new checkpoints. Legacy commits may contain it, so navigation saves its live contents in a durable Git-internal recovery journal and restores them after switching. Startup completes an interrupted restoration. This preserves layout, theme and navigation. Deleted-card originals under `.heavens-door/trash/` remain part of recovery history but are omitted from the user-facing changes list. Do not ignore the whole directory blindly.

## Applying changes between branches

Drag a checkpoint onto one in a diverged branch, or use **Apply changes onto current checkpoint** from its context menu. Confirm the named source and destination. Only the selected checkpoint's delta from its parent is applied; intermediate source commits are not silently included. The result is a new child of the destination; original checkpoints are retained.

Git `merge-tree --write-tree` performs the three-way merge using temporary objects and a separate index. Interface settings are removed from merge inputs. A conflict leaves both branches and live notes intact and reports that nothing was applied. There is no automatic conflict editor in this slice. Merge/root checkpoints cannot be used as a source; ancestor/descendant pairs and no-op results are rejected. This requires Git 2.38+.

App history respects staged user changes and unfinished terminal Git operations. Existing unmanaged repositories are not adopted. Multiple windows can edit normally, but history switching/application requires one window for that workspace until all-window draft coordination is implemented. Ordinary Git checkout protections remain enabled; no force reset is used.

History navigation and applying a checkpoint use the shared in-app confirmation dialog. Cancel is focused initially; Escape or a backdrop click cancels. Added-line counts use the positive theme color; removed-line counts use the negative color, retaining +/− symbols.

History uses the Git branch icon. Checkpoint cards align with commit dots in straight ancestry lanes; short bends connect branch/merge paths instead of long curves. Six theme-controlled lane colors identify visual ancestry tracks (not named Git branches); reused lanes can reuse colors. Hashes remain neutral. The current checkpoint has an extra ring, and +/- line counts retain separate positive/negative colors. A parent beyond the loaded history continues to the bottom edge rather than appearing as a root.
