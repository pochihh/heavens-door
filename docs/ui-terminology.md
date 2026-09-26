# App layout terminology

Use these names in interface text, settings and design discussions. **Action Ribbon**, **Main Dock**, **Left/Right Side Dock**, **View**, **Tab Group** and **Workspace** are the agreed product terms. Existing code identifiers and some preview labels still use earlier names; this document update does not change runtime behavior or saved-file formats.

## Workspace and layout

A **Workspace** is a folder containing cards, whiteboards, tags and attachments, together with its own settings and saved interface layout. Opening a Workspace opens that folder and restores its configuration. The layout belongs to the Workspace; it is not a separate collection of notes.

| Term | Definition |
| --- | --- |
| Workspace Folder | The Workspace's physical location on disk. |
| Workspace Layout | The saved arrangement of docks, their Tab Groups, open tabs and view positions. |
| Workspace Settings | Appearance, filename defaults and other preferences owned by that Workspace. |
| Workspace Switcher | The up/down-chevron icon and Workspace name at the bottom left. |
| Workspace Menu | The switcher's popup: registered Workspaces, the active checkmark, then **Manage workspaces** below a divider. |
| Workspace Manager | The dialog for opening/registering Workspaces, removing registrations and opening another window. Removing a registration leaves its files intact. |

## Interface structure

| Term | Definition |
| --- | --- |
| Action Ribbon | The narrow vertical strip at the far left, containing actions. |
| Action | An operation triggered by a button on the Action Ribbon. An action can reveal a View or open settings; it does not itself contain the View. |
| Main Dock | The central container for Whiteboard View, Card View, Tag View and other content views. It contains Tab Groups arranged through horizontal and vertical splits. |
| Left Side Dock / Right Side Dock | The collapsible columns beside the Main Dock. Both have identical capabilities. |
| View | The interface displayed inside a tab, such as a whiteboard canvas, card editor, explorer, search or history. A View's name describes its content; its dock describes its location. |
| Tab | An open instance of a View and its selector within a Tab Group. The active tab determines which View is shown. A tab is not the underlying file. |
| Tab Group | A resizable container of tabs in any dock, showing one active View. Side Docks stack Tab Groups vertically; the Main Dock also supports groups beside one another. |
| Tab Strip | The row of tab selectors belonging to one Tab Group. |
| Splitter | A draggable divider that resizes docks or Tab Groups. |
| Status Bar | The shared bottom strip. Workspace switching is on the left; sync and save/checkpoint status are on the right. |

A plugin can provide Views and actions. **Plugin** describes an extension; **View** describes its visible interface. The previous terms “module,” “panel group” and “document pane” remain in implementation identifiers and some preview labels. Use View and Tab Group in product discussions.

## Views in the preview

| View | Contents | Current location |
| --- | --- | --- |
| Whiteboard View | A whiteboard canvas with cards, references, connections and sub-whiteboards. | Main Dock |
| Card View | A card's formatted content and editor. | Main Dock |
| Tag View | Cards selected through a tag, presented as a table or Kanban. | Main Dock |
| File Preview | Read-only inspection of a physical file or image. | Main Dock |
| Whiteboard Explorer | The logical tree of matching whiteboard folders and their cards/tag pages. Ordinary folders and assets are hidden. | Either Side Dock |
| File Explorer | The physical folder/file tree, including assets, hidden files and app internals. | Either Side Dock |
| Starred & Recent | Manually ordered bookmarks followed by recently opened documents, in one scroller. | Either Side Dock |
| Tags | The Workspace's tag pages. | Either Side Dock |
| Search | Workspace card search. | Either Side Dock |
| Agent Console | The reserved agent surface; agent integration is currently disconnected. | Either Side Dock |
| History | Persistent Workspace Git checkpoints and restore actions. | Either Side Dock |

**Whiteboard View** displays a board; **Whiteboard Explorer** navigates boards. **Card View** displays one card; **File Explorer** navigates files. A card edited directly on a whiteboard stays inside Whiteboard View. Side Dock tabs show the active View's icon and name, joined to its content; inactive tabs show icons only. Main Dock tabs keep their document-tab appearance. The shorter navigation labels above are also Views; the word “View” need not appear on every tab. Graph View is not implemented in this preview.

The initial Left Side Dock has Whiteboard Explorer, File Explorer, Tags and Search in its upper Tab Group, with Starred & Recent below. The initial Right Side Dock contains Agent Console and History and starts collapsed. View-revealing actions activate the chosen View and expand its current dock without relocating it.

## Arranging Views

Drag a Side Dock **tab** onto another group's Tab Strip to combine them. Dropping onto an existing tab inserts before it. Drop near the top or bottom of a group's content to create a separate vertical group. There is no Tab Group drag handle; whole-group moves remain in the group menu. A collapsed or empty Side Dock exposes a temporary destination during dragging.

The group's **…** menu provides move, split, merge and collapse actions without dragging. Left/Right, Home and End navigate Side Dock tabs. Splitters also respond to arrow keys. Escape or an unfinished drag leaves the arrangement unchanged. Dock dragging operates within one app window; it does not create floating windows.

All tabs use the same phantom and insertion-preview behavior as Starred/Recent, described in [shared drag-and-drop interactions](interactions/drag-and-drop.md). An active tab keeps its appearance in the phantom; the destination previews it as active. The source selects the next tab or retains an empty View during the drag. The same file may be open in several Tab Groups, with independent view positions and shared edits. The preview permits up to 16 Main Dock Tab Groups and 200 tabs per group, matching the saved-layout validation limits. Side Dock tabs remain within the Left/Right Side Docks; Main Dock tabs remain within Main Dock Tab Groups. Cross-family drops are invalid.

## State ownership and current storage

`.heavens-door/settings.json` is readable, validated JSON and currently contains both Workspace settings and the saved Workspace layout:

- `docks`: Side Dock View placement, active tabs, Tab Group proportions, dock widths and collapsed states.
- `documents`: the most recently saved Main Dock layout, open tabs, active Tab Group, saved scroll positions/board cameras/tag presentations, and formatting-control visibility.
- `navigation`: each navigation View's expanded folders, search query and scroll position.
- Existing appearance, filename defaults, Starred, Recent and document icons.

A Workspace has its own saved layout regardless of how many windows open it. Side Dock arrangements are shared live across those windows. Each window's Main Dock tabs and view positions operate independently; its latest saved Main Dock state becomes the Workspace's next reopening layout. UI changes are batched and flushed before save-aware reload, close or Workspace switching. Layout changes are not content edits and do not add session-undo steps.

**Workspace settings → Reset side docks** restores the default Side Dock arrangement. To reset other layout state manually, close Workspace windows and remove `documents` and/or `navigation` from `settings.json`; missing fields rebuild from defaults. Leave the other settings fields intact. None of these layout fields owns card content or whiteboard geometry.

The registered Workspace list alone belongs to the app, in its user-data `workspaces.json`. The derived search index and recovery cache also live outside the Workspace but are not UI settings. No UI layout depends on browser session storage.

## Existing implementation names

These mappings explain the current code while product wording is adopted. They do not rename stored fields, DOM selectors or IPC payloads.

| Existing name | Product term |
| --- | --- |
| `activity-bar` / Activity bar | Action Ribbon |
| `workspace` / Document area / Main area / Workbench | Main Dock when referring to the central UI region; **Workspace** remains the whole folder and its configuration |
| `ModuleId`, `modules`, `module-tabs` | View identities, Views and Side Dock tabs |
| `PanelGroup` / Panel group | Tab Group in a Side Dock |
| `Pane`, `note-pane` / Document pane | Tab Group in the Main Dock |
