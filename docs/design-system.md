# Desktop design and interaction conventions

This documents the current UI implementation, not a future product roadmap.

## Reference and layout

The shell was implemented after reading SiYuan v3.8.5's layout, tabs, docks, list styling, default themes and Electron titlebar code. It is an independent implementation. Reference: [SiYuan source at v3.8.5](https://github.com/siyuan-note/siyuan/tree/v3.8.5/app). Explorer context actions also follow the compact, contextual approach in [VS Code's context-menu guidelines](https://code.visualstudio.com/api/ux-guidelines/context-menus).

`src/renderer/styles.css` is the source of the visual tokens. The default font stack begins with `BlinkMacSystemFont, Helvetica` and uses system emoji fonts. Default UI text is 14px. The merged title/tab row and activity bar are 42px. Left/right docks initially measure 232px/280px; panel-group tab strips are 34px. The statusbar is 32px. List rows have a 28px minimum height and 1px/8px outer spacing. Panel corners are 12px, control corners 6px. Controls use restrained hover fills and visible keyboard focus, not decorative cards or large instructional copy.

Light and dark palettes are CSS variables. A workspace's theme can follow the system. Tabs are unique within one pane; the same document can be open in different panes. Each pane keeps its own view position while editing the same underlying file. The mother whiteboard uses the workspace folder name and contains sub-whiteboards. Existing root cards remain accessible for explicit migration.

## Side docks and navigation

Use the names in [UI terminology](ui-terminology.md). Both docks have the same layout and controls: vertically resizable panel groups, an icon tab strip for each group, a whole-group drag grip visible on hover/focus, and a **…** menu. Module controls sit inside the active group's content. The activity bar contains all modules; clicking one reveals it in its assigned group and expands that dock. The window toolbar collapses either dock independently.

The bottom-left **workspace switcher** uses Lucide's `ChevronsUpDown` icon, aligned with the activity bar's icons, followed by the folder name. Its menu opens upward and contains registered workspace names with the current one checked, then a divider and **Manage workspaces** with the Database icon. Paths appear in tooltips. Sync and save/checkpoint state occupy the right end of the status bar. Word/card counts and undo/redo buttons are absent there.

- **Whiteboard explorer** is the daily navigation module: actual whiteboards, cards and tag pages. Ordinary folders and assets stay out. The disclosure arrow expands a whiteboard; clicking its label opens it.
- **File explorer** is a separate module. Folders expand on click. It shows Markdown, `.whiteboard`, `.tag`, attachments, hidden files and app/Git internals. Listing never changes a folder into a whiteboard. Refresh is explicit for ignored/internal directories that the workspace watcher does not monitor.
- A row's **+** and **…** appear on hover or keyboard focus; on touch they remain visible. **+** on a folder offers only **New sub-whiteboard** and **New note**. The root's note action is disabled with an explanation in its tooltip.
- Right-click and **…** call the same action builder. The menu supports arrows, Home/End and Escape, and restores focus when closed. File operations currently include open, open to side, bookmark, icon, source inspection, path copy, reveal, refresh and collapse. It does not pretend to offer unimplemented rename/delete/move actions.
- Starred and Recent share one scrolling panel. Empty Starred occupies only its header, which accepts drops. Document icons stay visible on hover/drag; there is no section drop highlight. Recent stays chronological. Starred is manually ordered. Dragging changes bookmarks, never file locations. The precise drag behavior is in [drag-and-drop.md](interactions/drag-and-drop.md).

## Whiteboard cards

The header chevron collapses/expands a card in place. A collapsed card is a 40px-high title row, using its first H1 or its filename; hovering still reveals the file path. It does not mount a preview or editor. Expanded dimensions and coordinates remain saved. Collapse belongs to a placement, so references on other boards can have different states. See [whiteboards.md](whiteboards.md) for automatic column placement and storage.

## Icons and emoji

Use `Icon` and `Tool` from `Icons.tsx`; do not draw SVG paths for standard controls. Icons come from named, tree-shakable [Lucide React](https://lucide.dev/guide/react) imports, normally 16px with a 1.65 stroke. Default whiteboard/card glyphs are Map/FileText. Add a named import and mapping when a feature needs another standard glyph.

Document icons render through `DocumentIcon`. Settings store either native Unicode emoji or a known `icon:<name>` key. Empty values restore the type's default. The picker offers a curated Lucide palette and the searchable [Emoji Mart](https://github.com/missive/emoji-mart) catalog. Emoji Mart and its data load in a separate chunk only when requested; no remote sprites or emoji-data fetches are needed. Native glyph appearance varies by operating system.

## Tooltips and accessibility

Use `<Tool icon="…" label="Action · shortcut" />` for icon buttons. For other controls, attach `data-tooltip="…"` and provide an accessible name when visible text is insufficient. Avoid native `title` tooltips in app components: the shared `TooltipHost` owns the overlay.

The tooltip appears after 450ms of hover or immediately on keyboard focus. It is portaled above panels, clamped to the viewport, uses `role="tooltip"` and temporarily attaches `aria-describedby`. Pointer-down, leaving the control, focus loss, scrolling, Escape and window blur dismiss it. Tooltips carry short instructions or shortcuts; they never carry essential state that is unavailable elsewhere. Dragging suppresses tooltips.

Menus and dialogs keep action names visible and support keyboard dismissal. Icon-only controls need an `aria-label`. Hover actions remain keyboard reachable. Motion honors reduced-motion preferences. Shared interaction code and these docs must change together when behavior changes.
