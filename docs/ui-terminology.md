# UI terminology

Canonical product vocabulary agreed with Toby on 2026-11-02. Read this guide before discussing, designing, documenting or changing Heaven’s Door UI. Use these names even where platform conventions differ. This guide supersedes older wording in design notes, previews and UI catalogs; memory should point here rather than become a competing glossary.

This terminology change does not rename code identifiers, CSS classes, IPC commands, preference keys or saved-file formats. Update visible wording through the [UI text catalogs](ui-text.md) when implementing UI changes.

## App window and navigation

| Canonical term | Definition in Heaven’s Door |
| --- | --- |
| Menu bar | The application menus, such as Heaven’s Door, File, Edit, View, Window and Help. On macOS this is at the top of the screen, outside the app window. A menu is an individual item in that bar, such as File. |
| Title bar | The window’s top region, including window controls and its draggable area. The Title toolbar and Document Tabs may share this region visually. |
| Title toolbar | App-wide controls within the window, including workspace switching, search and sidebar toggles. Use this term instead of Main toolbar or Window toolbar. |
| Document Tabs | The tabs for open documents and other Views in the Main area. Use this term instead of Tab bar or Tab strip for this part of the UI. |
| Document bar | The row for the current document, containing Breadcrumbs, document navigation and Document tools. |
| Document tools | The Star and More controls within the Document bar. These are controls within the bar, not a separate bar. |
| Breadcrumbs | The clickable location trail, such as First Door → Projects → Heaven’s Door. |
| Action bar | The customizable vertical action strip at the far left. An action can run a command, reveal a View or open Settings. |
| Left sidebar / Right sidebar | The collapsible regions beside the Main area. Both support the same capabilities. |
| Main area | The central region displaying Whiteboard View, Card View, Tag View, Graph View and other content Views. It can be split horizontally or vertically. |
| tabs | The term for a set of tabs sharing one visible View. Do not call it a Tab group. Use the contextual names Document Tabs and View tabs. |
| View tabs | Tabs for supporting Views, such as Whiteboard explorer, Search, Style and History, usually in a sidebar. A sidebar can contain multiple vertically arranged sets of View tabs. |
| Tab | An individual selector and its open instance of a View. A Tab is not the underlying file. |
| View | The interface displayed by an active Tab, such as a whiteboard canvas, card editor, explorer, search or graph. Its name describes its content; its location describes where it appears. |
| Splitter | A draggable divider for resizing the sidebars or split sections of the Main area or sidebars. |
| Status bar | The shared bottom row for save, sync and related status. |

Use the exact canonical spellings above, including **Document Tabs**, **View tabs**, **Title toolbar**, **Document bar** and **Document tools**. Sentence grammar may change an ordinary plural, but do not substitute another product name.

The Menu bar, Title bar and Title toolbar have distinct meanings even if a platform visually combines some window chrome. Avoid the ambiguous phrase “app bar.” When discussing File/Edit/View/Help, say Menu bar.

### Talking about tabs and splits

- Say “Document Tabs,” “View tabs,” “these tabs,” “move these View tabs” or “resize the split.” Do not introduce Tab group, tab set or another replacement product label.
- Document Tabs occupy the Main area. View tabs occupy a sidebar. Each split section displays the active View of its tabs.
- A Tab is singular; tabs describes the collection. Tabs can be rearranged, moved between compatible locations, split, combined or closed.
- Splitting the Main area creates another section with Document Tabs. Splitting a sidebar creates another section with View tabs.
- The same file can appear in several split sections with independent view positions and shared edits.
- Closing a Tab closes its View instance; deleting a card or whiteboard affects the underlying files. Keep these actions distinct in labels and explanations.

### Actions and split wording

The **Document Tabs actions** button opens a dropdown containing **Search tabs**, **Split right**, **Split down** and **Close split**. Search tabs closes the dropdown and opens its own search popover. Clicking elsewhere, choosing an action, Escape, focus loss or resizing closes the actions dropdown through the shared menu behavior. There is no separate Search tabs button.

Use **View tabs actions** for sidebar tab menus. A **split** is a section of the Main area or a sidebar, not a synonym for a single Tab or View. Use **Open in another split** and **Close split** for those actions, as agreed on 2026-11-02. Keep the split’s Document Tabs or View tabs name when describing its tab collection.

Runtime labels, tooltips, Settings, accessibility names and visible validation messages follow this vocabulary. `tests/text.test.ts` guards app-authored source text against superseded names. Internal keys, technical comments, saved formats, user content and legacy Settings search aliases retain their own spelling.

## Floating UI and notices

| Canonical term | Definition |
| --- | --- |
| Context menu | Actions opened by right-click or its keyboard equivalent. |
| Dropdown menu | A menu of actions or choices opened by a button. |
| More menu | The dropdown menu opened by an ellipsis (**…**) button. More describes the trigger; the menu still follows the shared menu contract. |
| Popover | A floating interactive surface containing richer controls, such as a color picker or property editor. |
| Dialog | A separate task surface, such as Settings or a deletion confirmation. Modal describes a Dialog that blocks background interaction. |
| Tooltip | Short, non-interactive information associated with a control, normally shown on hover. |
| Banner | A persistent notice within the interface. |
| Toast | A brief notification that disappears automatically. |

Use [Menus and tooltips](interactions/menus-and-tooltips.md) for placement, dismissal, focus and interaction rules. The approved warning/error layout is the bottom Context banner; see [Context banners and reports](interactions/notices.md).

## Workspace and scope

A **Workspace** is a folder containing cards, whiteboards, tags and attachments, together with its settings and saved interface layout. **Main area** names a UI region; **Workspace** names the folder and its configuration.

| Term | Definition |
| --- | --- |
| Workspace folder | The Workspace’s physical location on disk. |
| Workspace layout | The saved arrangement of sidebars, tabs, splits and View positions. |
| Workspace settings | Preferences belonging to that Workspace. |
| Workspace switcher | The control containing the Workspace name in the Title toolbar. |
| Workspace menu | The switcher’s dropdown, with registered Workspaces and Manage workspaces. |
| Workspace manager | The Dialog for opening/registering Workspaces, removing registrations and opening another window. Removing a registration leaves its files intact. |
| Home | The top-level whiteboard in general discussion. Display its Workspace name; renaming it renames the Workspace and requires a warning. |
| This computer | Settings scope for app/device preferences. |
| Workspace specific | Settings scope for preferences belonging to the current Workspace. Do not substitute the Workspace name for this scope label. |

## Views

| View | Contents | Usual location |
| --- | --- | --- |
| Whiteboard View | A canvas containing cards, Text, images, PDF attachments, whiteboard tiles, edges and mention links. | Main area |
| Card View | A card’s formatted content and editor. | Main area |
| Tag View | A tag’s properties and associated cards or saved views. | Main area |
| File Preview | Inspection of a physical file or image. | Main area |
| Graph View | A graph of relationships between documents. | Main area or a sidebar |
| Whiteboard explorer | Logical whiteboards and optionally their owned cards; ordinary folders and assets stay out. | Either sidebar |
| File explorer | Physical files and folders, including assets and app internals. | Either sidebar |
| Starred & Recent | Bookmarks followed by recently opened documents. | Either sidebar |
| Tags | The Workspace’s tag pages. | Either sidebar |
| Search | Workspace search. | Either sidebar or a search Dialog |
| Agent console | The reserved agent View. | Either sidebar |
| History | Workspace checkpoints and restore actions. | Either sidebar |
| Style | Appearance controls for the current document or whiteboard selection. | Either sidebar |

Whiteboard View displays a board; Whiteboard explorer navigates boards. Card View displays a card; File explorer navigates physical files. Editing a card directly on a whiteboard remains inside Whiteboard View. A plugin can supply Views and actions; Plugin describes the extension, while View describes its visible interface.

## Internal identifiers and legacy wording

These are lookup mappings, not instructions to rename internals or saved data.

| Existing identifier or old wording | Canonical UI wording |
| --- | --- |
| Main toolbar / Window toolbar / `window-toolbar` | Title toolbar |
| Document toolbar / `document-toolbar` | Document bar |
| Star / More in the document header | Document tools |
| Tab bar / Tab strip / `tab-strip` / `MainTabs` | Document Tabs in the Main area; View tabs in a sidebar |
| Action Ribbon / Activity bar / `activity-bar` / `ActionHub` | Action bar |
| Main Dock / Document area / Workbench / `workspace` as a UI container | Main area |
| Left Side Dock / Right Side Dock / `docks.left` / `docks.right` | Left sidebar / Right sidebar |
| Tab Group / `Pane` / `note-pane` / `PanelGroup` | tabs, qualified as Document Tabs or View tabs |
| `ModuleId` / `modules` / `module-tabs` | View identities, Views and View tabs |
| `docks` / `documents` / `navigation` in preferences | Existing storage fields; preserve their identifiers and behavior |

For Edge, Anchor, Endpoint, Mention, Mention link, Backlink and Reference, see [whiteboard relationship vocabulary](interactions/edges-and-style.md#vocabulary). Terminology here identifies UI regions and surfaces; it does not change whiteboard data semantics.
