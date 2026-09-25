# App layout terminology

Use these names in interface text, settings and design discussions. “Panel” alone is ambiguous; use **panel group** for side-dock containers and **document pane** for the center.

| Term | Definition |
| --- | --- |
| Workspace | A local folder containing cards, whiteboards, tags, assets and its own settings. |
| Activity bar | The narrow vertical strip at the far left. Its buttons reveal modules in their current locations. |
| Side dock | Either collapsible column beside the document area: **left dock** or **right dock**. Both have identical capabilities. |
| Panel group | One vertically resizable section inside a side dock. It contains module tabs and shows one active module. |
| Module | A tool or navigation view that can live in either side dock. |
| Module tab | An icon tab that selects a module inside a panel group. |
| Document area | The center of the window, containing one or more document panes. |
| Document pane | One split region of the document area, with its own open documents and active tab. |
| Document tab | An open card, whiteboard, tag page or inspected file within a document pane. |
| Splitter | A draggable divider that resizes docks, panel groups or document panes. |
| Status bar | The shared bottom strip. Workspace switching is on the left; sync and save/checkpoint status are on the right. |
| Workspace switcher | The up/down-chevron icon and workspace name at the bottom left. |
| Workspace menu | The switcher's popup: registered workspaces, the active checkmark, then **Manage workspaces** below a divider. |
| Workspace manager | The dialog for opening/registering workspaces, removing registrations and opening another window. Removing a registration leaves its files intact. |

## Modules

| Module name | Contents |
| --- | --- |
| Whiteboard explorer | The logical tree of matching whiteboard folders and their cards/tag pages. Ordinary folders and assets are hidden. |
| File explorer | The physical folder/file tree, including assets, hidden files and app internals. |
| Starred & Recent | Manually ordered bookmarks followed by recently opened documents, in one scroller. |
| Tags | The workspace's tag pages. |
| Search | Workspace card search. |
| Agent console | The reserved agent surface; agent integration is currently disconnected. |
| History | Persistent workspace Git checkpoints and restore actions. |

The initial left dock has Whiteboard explorer, File explorer, Tags and Search in its upper panel group, with Starred & Recent below. The initial right dock contains Agent console and History and starts collapsed. Activity buttons activate the chosen module and expand its dock. They do not relocate it.

## Arranging modules

Drag a **module tab** onto another group's tab strip to combine them. Dropping onto an existing tab inserts before it. Drop near the top or bottom of a group's content to create a separate vertical group. The grip in a tab strip moves the **whole panel group**. A collapsed or empty dock exposes a drop target during dragging.

The group's **…** menu provides move, split, merge and collapse actions without dragging. Left/Right, Home and End navigate module tabs. Splitters also respond to arrow keys. Escape or an unfinished drag leaves the arrangement unchanged. Dock dragging operates within one app window; it does not create floating windows.

Document tabs belong to the center and have their own drag behavior. A document may be open in several document panes, with independent view positions and shared edits. Document tabs are not module tabs. The preview permits up to 16 document panes and 200 tabs per pane, matching the saved-layout validation limits.

## State ownership

`.heavens-door/settings.json` is readable, validated JSON and contains:

- `docks`: module placement, active module tabs, panel-group proportions, dock widths and collapsed states.
- `documents`: the most recently saved document layout, open tabs, active pane, per-pane scroll/board camera/tag view, and formatting-control visibility.
- `navigation`: each navigation module's expanded folders, search query and scroll position.
- Existing appearance, filename defaults, Starred, Recent and document icons.

Side-dock arrangements are shared live across windows of the same workspace. Each window's open documents and view positions operate independently; its latest saved document state becomes the workspace's next reopening layout. UI changes are batched and flushed before save-aware reload, close or workspace switching. Layout changes are not content edits and do not add session-undo steps.

**Workspace settings → Reset side docks** restores the default arrangement. To reset other layout state manually, close workspace windows and remove `documents` and/or `navigation` from `settings.json`; missing fields rebuild from defaults. Leave the other settings fields intact. None of these layout fields owns card content or whiteboard geometry.

The registered workspace list alone belongs to the app, in its user-data `workspaces.json`. The derived search index and recovery cache also live outside the workspace but are not UI settings. No UI layout depends on browser session storage.
