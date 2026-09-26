# Desktop design and interaction conventions

This documents the current UI implementation, not a future product roadmap.

## Reference and layout

The shell was implemented after reading SiYuan v3.8.5's layout, tabs, docks, list styling, default themes and Electron titlebar code. It is an independent implementation. Reference: [SiYuan source at v3.8.5](https://github.com/siyuan-note/siyuan/tree/v3.8.5/app). Explorer context actions also follow the compact, contextual approach in [VS Code's context-menu guidelines](https://code.visualstudio.com/api/ux-guidelines/context-menus).

`src/renderer/styles.css` is the source of the visual tokens. The default font stack begins with `BlinkMacSystemFont, Helvetica` and uses system emoji fonts. Default UI text is 14px. The merged title/tab row and Action Ribbon are 42px. Left/Right Side Docks initially measure 232px/280px; Tab Group tab strips are 34px. The statusbar is 32px. List rows have a 28px minimum height and 1px/8px outer spacing. Panel corners are 12px, control corners 6px. Controls use restrained hover fills and visible keyboard focus, not decorative cards or large instructional copy.

The **Main Dock** is the central region containing Whiteboard View, Card View and other content views. It can split horizontally and vertically. Left and Right Side Docks flank it. See [UI terminology](ui-terminology.md) for the agreed names and their existing implementation identifiers.

Light and dark palettes are CSS variables. A workspace's theme can follow the system. Tabs are unique within one Main Dock Tab Group; the same document can be open in different Tab Groups. Each group keeps its own view position while editing the same underlying file. The mother whiteboard uses the workspace folder name and contains sub-whiteboards. Existing root cards remain accessible for explicit migration.

## Docks and navigation

Use the names in [UI terminology](ui-terminology.md). The Left and Right Side Docks have the same layout and controls: vertically resizable Tab Groups, a tab strip for each group and a tab context menu for close/move/split/merge commands. Right-click an individual tab to act on that View; right-click unused Tab Strip space to act on the active View. Shift+F10 or the Menu key opens the focused tab’s menu. There is no persistent **…** button. View controls sit inside the active group's content. The Action Ribbon contains actions for revealing the current Side Dock Views and opening Workspace settings. A View action reveals it in its assigned group and expands that dock. The window toolbar collapses either dock independently. **Close View Tab** closes the selected tab without deleting content; the Action Ribbon reopens a closed Side Dock View in its remembered group, recreating that group if needed. Closing the last tab removes its Side Dock group; closing the last group collapses that dock. Closed placements persist with the Workspace layout. Main Dock tab context menus also provide **Close View Tab**, using the same save behavior as their existing close button.

The bottom-left **workspace switcher** uses Lucide's `ChevronsUpDown` icon, aligned with the Action Ribbon's icons, followed by the folder name. Its menu opens upward and contains registered workspace names with the current one checked, then a divider and **Manage workspaces** with the Database icon. Paths appear in tooltips. Sync and save/checkpoint state occupy the right end of the status bar. Word/card counts and undo/redo buttons are absent there.

- **Whiteboard explorer** is the daily navigation View: actual whiteboards, cards and tag pages. Ordinary folders and assets stay out. The disclosure arrow expands a whiteboard; clicking its label opens it.
- **File explorer** is a separate View. Folders expand on click. It shows Markdown, `.whiteboard`, `.tag`, attachments, hidden files and app/Git internals. Listing never changes a folder into a whiteboard. Refresh is explicit for ignored/internal directories that the workspace watcher does not monitor.
- A row's **+** and **…** appear on hover or keyboard focus; on touch they remain visible. **+** on a folder offers only **New whiteboard** and **New note**. The root's note action is disabled with an explanation in its tooltip.
- An item’s right-click menu and hover **…** call the same action builder: open, open to side, bookmark, icon, source inspection, path copy and reveal. Explorer-wide Refresh and Collapse folders live in its background context menu. Shift+F10 or the Menu key opens the focused item/background menu; menus support arrows, Home/End and Escape, and restore focus when closed. Explorer has no standalone **…** button or empty toolbar row. Search retains its input and clear action. Unimplemented rename/delete/move actions are omitted.
- Starred and Recent share one scrolling panel. Empty Starred occupies only its header, which accepts drops. Document icons stay visible on hover/drag; there is no section drop highlight. Recent stays chronological. Starred is manually ordered. Dragging changes bookmarks, never file locations. The precise drag behavior is in [drag-and-drop.md](interactions/drag-and-drop.md).

## Side Dock tabs and motion

Side Docks and the Main Dock share the View/Tab Group model but have distinct tab styling. Main Dock tabs retain their existing appearance. In each Side Dock Tab Group, the active tab shows its icon and View name on the same surface as its content, with no gap or border between them. The Tab Strip has no trailing menu padding: a sole or rightmost active tab reaches the content’s right edge. Inactive tabs show icons only. Names truncate when space is tight; tooltips and accessible names retain the full title. Tabs keep their order when selected, and overflow scrolls horizontally, keeping the selected tab visible after it expands. The View name is not repeated in a content heading; View-specific tools remain inside the content.

Motion uses CSS tokens in `styles.css`:

| Token | Default | Use |
| --- | --- | --- |
| `--motion-fast` | 120 ms | Hover, focus, color and opacity feedback. |
| `--motion-normal` | 180 ms | Small state changes, including active Side Dock tab expansion. |
| `--motion-ease` | `cubic-bezier(.2,0,0,1)` | Ease out without bounce or overshoot. |

Keep motion local: Side Dock tab widths and labels transition, while content switches immediately without sliding or fading the whole View. Prefer transform/opacity for other motion; the short tab row is the deliberate size-animation exception. Avoid `transition: all`. Dragging, resizing and whiteboard navigation must track the pointer without easing; Side Dock phantoms expand and other tabs collapse using the same width and label timing as ordinary selection. Only size and appearance ease; phantom X/Y follow the pointer immediately. Bookmark and tab neighbors share the same 150 ms displacement animation. See [shared drag-and-drop interactions](interactions/drag-and-drop.md) for source fallback, empty destination slots, empty groups and dock-family restrictions. Reduced motion sets these durations to zero. The existing 650 ms Main Dock focus indicator remains a separate attention cue and is disabled under reduced motion. New animations should use these conventions rather than add arbitrary timings or a motion library.

## Whiteboard cards

Expanded cards have no top bar. A floating upper-right chevron appears on hover, selection or keyboard focus and collapses the card in place; the same button becomes the expand chevron at the same coordinates. Collapsed cards retain the same H1 font, formatting, padding and wrapping. Their minimum height is 70px and grows to fit the title. They render only indexed heading metadata, with no body reads or editors; hovering still reveals the file path. Expanded dimensions and coordinates remain saved. Collapse belongs to a placement, so references on other boards can have different states. See [whiteboards.md](whiteboards.md) for automatic column placement and storage.

Cards and whiteboard tiles share the bottom-right L-shaped resize control. Keep the hit target 20px square with a 9px corner mark; this is a geometric handle, not a diagonal arrow. Drag cards by their 10px outer padding/frame; their content remains directly editable. Whiteboard tiles drag by their body and open by double-click or the corner arrow. Keep selected items above ordinary items, the active editor above those, and moving/resizing items above all three. These layers are temporary interaction state, not stored board order.

Only selected card content scrolls. Unselected previews clip their content and route the wheel to the canvas. Pinch and Ctrl/Command-wheel always zoom. Expanded previews keep the same formatted content at all zoom levels; use offscreen culling, cached HTML and lazy images instead of substituting title-only cards. The zoom percentage is a **Zoom to fit** button, between minus and plus.

A whiteboard tile uses a compact icon/name/count header followed by up to six labeled previews of contained cards or whiteboards and a remaining count. It reads existing workspace metadata, never mounts recursive canvases or loads child note bodies. App actions say **New whiteboard** and **Open whiteboard**, regardless of nesting.

Every card reserves its **leading H1** as its title. If no leading H1 exists, previews and the editor show an empty heading with the gray **A new card** prompt. The prompt is a CSS overlay, not text to select/delete, not the filename, and not stored note content. Workspace settings expose **Empty card title** to customize it. Typing inserts a real H1; Enter continues into body content. Opening or focusing an empty/heading-less card does not write a file. Later H1s remain body sections, and existing body content stays in place.

## Icons and emoji

Use `Icon` and `Tool` from `Icons.tsx`; do not draw SVG paths for standard controls. Icons come from named, tree-shakable [Lucide React](https://lucide.dev/guide/react) imports, normally 16px with a 1.65 stroke. Default whiteboard/card glyphs are Map/FileText. Add a named import and mapping when a feature needs another standard glyph.

Document icons render through `DocumentIcon`. Settings store either native Unicode emoji or a known `icon:<name>` key. Empty values restore the type's default. The picker offers a curated Lucide palette and the searchable [Emoji Mart](https://github.com/missive/emoji-mart) catalog. Emoji Mart and its data load in a separate chunk only when requested; no remote sprites or emoji-data fetches are needed. Native glyph appearance varies by operating system.

## Tooltips and accessibility

Use `<Tool icon="…" label="Action · shortcut" />` for icon buttons. For other controls, attach `data-tooltip="…"` and provide an accessible name when visible text is insufficient. Avoid native `title` tooltips in app components: the shared `TooltipHost` owns the overlay.

The target behavior is a tooltip after 450ms of genuine pointer hover only. Clicking, right-clicking, menu opening, keyboard focus, and programmatic focus must not show one. Opening a menu clears existing and pending tooltips; fully visible menu labels are not repeated in tooltips. Tips anchor to their owner and stay outside actionable menu rows. Accessible names and essential descriptions remain available without hover. See [Menus and tooltips](interactions/menus-and-tooltips.md) for positioning, suppression, dismissal, and the current implementation gaps.

Menus keep action names visible and close on Escape or pointer-down anywhere outside. Dropdowns and context menus share the same interaction contract; form popovers retain normal input behavior. Outside-click dismissal must not steal focus from the clicked control. Icon-only controls need an accessible name. Hover actions remain keyboard reachable. Motion honors reduced-motion preferences. Shared interaction code and these docs must change together when behavior changes.
