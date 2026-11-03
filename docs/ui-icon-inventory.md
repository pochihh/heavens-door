# UI icon inventory

Source snapshot: 2026-11-02. 98 semantic icon keys in `src/renderer/Icons.tsx`; 97 distinct Lucide components. 29 choices in the document icon picker. This is an inventory, not approval to replace symbols. Use the canonical [UI terminology](ui-terminology.md).

The shared default is 16px / stroke 1.65. Picker artwork uses 20px. The table lists literal callers plus picker availability; dynamically computed property/layout/action keys can have additional callers. A dash does not mean unused. See [cleanup review and family comparison](ui-cleanup-review.md#icon-direction-for-discussion).

| Semantic key | Current Lucide component | Literal caller files / picker |
| --- | --- | --- |
| `alignTop` | `AlignStartHorizontal` | Dynamic consumers; review before removal |
| `alignBottom` | `AlignEndHorizontal` | Dynamic consumers; review before removal |
| `spaceVertical` | `AlignVerticalSpaceBetween` | Dynamic consumers; review before removal |
| `math` | `Sigma` | EditorControls.tsx |
| `graph` | `Network` | Docks.tsx, features.ts, documents.ts |
| `home` | `Home` | Dynamic consumers; review before removal |
| `layers` | `Layers` | Explorer.tsx, ActionHub.tsx, features.ts |
| `imageBetween` | `AlignHorizontalSpaceBetween` | Dynamic consumers; review before removal |
| `imageLeft` | `AlignHorizontalJustifyStart` | Dynamic consumers; review before removal |
| `imageCenter` | `AlignHorizontalJustifyCenter` | Dynamic consumers; review before removal |
| `imageRight` | `AlignHorizontalJustifyEnd` | Dynamic consumers; review before removal |
| `caption` | `Captions` | EditorImage.tsx |
| `crop` | `Crop` | EditorImage.tsx |
| `strike` | `Strikethrough` | EditorControls.tsx |
| `text` | `AlignLeft` | EditorImage.tsx, Board.tsx, EditorControls.tsx, StyleView.tsx, SystemView.tsx |
| `filter` | `Funnel` | ViewBlock.tsx |
| `compact` | `Rows3` | ViewBlock.tsx, ReadingLibrary.tsx, TagView.tsx |
| `number` | `Hash` | Dynamic consumers; review before removal |
| `checkbox` | `SquareCheck` | Dynamic consumers; review before removal |
| `back` | `ArrowLeft` | App.tsx, PdfReader.tsx, CalendarView.tsx, EditorControls.tsx |
| `forward` | `ArrowRight` | App.tsx, PdfReader.tsx, CalendarView.tsx, EditorControls.tsx |
| `inherits` | `CornerDownRight` | TagView.tsx |
| `branch` | `GitBranch` | Docks.tsx, HistoryView.tsx, Board.tsx, StyleView.tsx |
| `warning` | `TriangleAlert` | PdfReader.tsx |
| `trash` | `Trash2` | EditorImage.tsx, App.tsx, Explorer.tsx, Annotations.tsx, ViewBlock.tsx, Board.tsx, EditorControls.tsx, CardPopup.tsx, SystemView.tsx, features.ts |
| `autoInput` | `WandSparkles` | Board.tsx |
| `mouse` | `Mouse` | Dynamic consumers; review before removal |
| `trackpad` | `Touchpad` | Dynamic consumers; review before removal |
| `workspace` | `ChevronsUpDown` | WorkspaceMenu.tsx |
| `map` | `Map` | App.tsx, Explorer.tsx, Docks.tsx, Board.tsx, SearchView.tsx, ActionHub.tsx, StyleView.tsx, documents.ts, Document icon picker |
| `note` | `FileText` | App.tsx, Explorer.tsx, ViewResults.tsx, TimelineView.tsx, Board.tsx, TagView.tsx, TemplateDialog.tsx, StyleView.tsx, documents.ts, Document icon picker |
| `tag` | `Tag` | Docks.tsx, DocumentViews.tsx, Board.tsx, SettingsPanel.tsx, TagView.tsx, SystemView.tsx, features.ts, documents.ts, Document icon picker |
| `star` | `Star` | App.tsx, Explorer.tsx, Docks.tsx, Document icon picker |
| `clock` | `History` | Explorer.tsx |
| `search` | `Search` | App.tsx, PdfReader.tsx, Docks.tsx, MainTabs.tsx, GraphView.tsx, ReadingLibrary.tsx, SearchView.tsx, SettingsPanel.tsx, ActionHub.tsx, SystemView.tsx |
| `plus` | `Plus` | App.tsx, SettingsPathInput.tsx, TableView.tsx, PdfReader.tsx, Explorer.tsx, Annotations.tsx, ViewBlock.tsx, ViewResults.tsx, HistoryView.tsx, WorkspaceMenu.tsx, ReadingLibrary.tsx, DocumentViews.tsx, TimelineView.tsx, Board.tsx, SettingsPanel.tsx, TagView.tsx, TemplateDialog.tsx, EditorControls.tsx, ActionHub.tsx, StyleView.tsx, ReferencePicker.tsx, SystemView.tsx |
| `close` | `X` | App.tsx, Edges.tsx, PdfReader.tsx, Docks.tsx, ViewBlock.tsx, WorkspaceMenu.tsx, MainTabs.tsx, ReadingLibrary.tsx, SearchView.tsx, TagView.tsx, TemplateDialog.tsx, CardPopup.tsx, StyleView.tsx |
| `chevron` | `ChevronRight` | Overlays.tsx, ViewBlock.tsx, DateProperty.tsx, TimelineView.tsx |
| `down` | `ChevronDown` | App.tsx, PdfReader.tsx, CodeBlockContent.tsx, ViewBlock.tsx, TimelineView.tsx |
| `chevronUp` | `ChevronUp` | PdfReader.tsx, Annotations.tsx |
| `left` | `PanelLeft` | App.tsx |
| `right` | `PanelRight` | App.tsx |
| `splitRight` | `Columns2` | EditorImage.tsx, App.tsx, Explorer.tsx, Breadcrumbs.tsx, GraphView.tsx, Board.tsx, SearchView.tsx |
| `splitDown` | `Rows2` | App.tsx |
| `settings` | `Settings` | App.tsx, Explorer.tsx, SettingsPanel.tsx |
| `more` | `Ellipsis` | EditorImage.tsx, App.tsx, Explorer.tsx, ViewBlock.tsx, ViewResults.tsx, GraphView.tsx, Board.tsx, BoardPdf.tsx, TagView.tsx, CardPopup.tsx, SystemView.tsx |
| `undo` | `Undo2` | ActionHub.tsx, SystemView.tsx |
| `redo` | `Redo2` | ActionHub.tsx |
| `agent` | `Sparkles` | Docks.tsx |
| `window` | `PanelsTopLeft` | Docks.tsx, WorkspaceMenu.tsx, Board.tsx, SettingsPanel.tsx, CardPopup.tsx |
| `folder` | `Folder` | EditorImage.tsx, App.tsx, Explorer.tsx, Docks.tsx, WorkspaceMenu.tsx, SearchView.tsx, SettingsPanel.tsx, Document icon picker |
| `check` | `Check` | WorkspaceMenu.tsx, TagView.tsx, StyleView.tsx |
| `sync` | `RefreshCw` | EditorImage.tsx, App.tsx, PdfReader.tsx, Explorer.tsx, WorkspaceMenu.tsx, GraphView.tsx, ActionHub.tsx |
| `table` | `Table2` | ViewBlock.tsx, Document icon picker |
| `kanban` | `SquareKanban` | ViewBlock.tsx, Document icon picker |
| `format` | `AlignLeft` | EditorControls.tsx |
| `database` | `Database` | ViewBlock.tsx, WorkspaceMenu.tsx, EditorControls.tsx, features.ts, Document icon picker |
| `grip` | `GripVertical` | TableView.tsx, WorkspaceMenu.tsx, CommandSettings.tsx, TagView.tsx, EditorControls.tsx |
| `file` | `File` | EditorImage.tsx, Explorer.tsx, Board.tsx, DocumentLink.tsx |
| `image` | `Image` | EditorImage.tsx, Board.tsx, EditorControls.tsx, StyleView.tsx, Document icon picker |
| `source` | `FileCode` | EditorImage.tsx, App.tsx, Explorer.tsx, EditorControls.tsx, HtmlContent.tsx |
| `copy` | `Copy` | EditorImage.tsx, App.tsx, Explorer.tsx, ViewBlock.tsx, Board.tsx, SettingsPanel.tsx, DocumentLink.tsx, EditorControls.tsx, ActionHub.tsx, SystemView.tsx, features.ts |
| `reveal` | `FolderOpen` | Explorer.tsx, SettingsPanel.tsx |
| `collapse` | `ChevronsDownUp` | Explorer.tsx |
| `book` | `BookOpen` | SettingsPanel.tsx, Document icon picker |
| `idea` | `Lightbulb` | Document icon picker |
| `science` | `FlaskConical` | Document icon picker |
| `target` | `Target` | Document icon picker |
| `expand` | `Maximize2` | GraphView.tsx, Board.tsx |
| `plant` | `Sprout` | Document icon picker |
| `pin` | `Pin` | Document icon picker |
| `heart` | `Heart` | Document icon picker |
| `bookmark` | `Bookmark` | Document icon picker |
| `calendar` | `Calendar` | Docks.tsx, ViewBlock.tsx, SettingsPanel.tsx, features.ts, Document icon picker |
| `tasks` | `ListTodo` | SettingsPanel.tsx, EditorControls.tsx, Document icon picker |
| `music` | `Music` | Document icon picker |
| `film` | `Film` | Document icon picker |
| `globe` | `Globe` | ReadingLibrary.tsx, Document icon picker |
| `code` | `Code` | ViewBlock.tsx, SettingsPanel.tsx, EditorControls.tsx, Document icon picker |
| `coffee` | `Coffee` | Document icon picker |
| `work` | `Briefcase` | Document icon picker |
| `study` | `GraduationCap` | Document icon picker |
| `art` | `Palette` | App.tsx, Edges.tsx, Explorer.tsx, Docks.tsx, Annotations.tsx, Board.tsx, EditorControls.tsx, CardPopup.tsx, StyleView.tsx, Document icon picker |
| `rocket` | `Rocket` | Document icon picker |
| `link` | `Link` | App.tsx, Board.tsx, EditorControls.tsx, ReferencePicker.tsx, Document icon picker |
| `up` | `ArrowUp` | Explorer.tsx, Docks.tsx, EditorControls.tsx, StyleView.tsx |
| `arrowDown` | `ArrowDown` | Explorer.tsx, Docks.tsx, ViewBlock.tsx, EditorControls.tsx, StyleView.tsx |
| `edit` | `Pencil` | EditorImage.tsx, Edges.tsx, Explorer.tsx, ViewBlock.tsx, CommandSettings.tsx, Board.tsx, SettingsPanel.tsx, TagView.tsx, SystemView.tsx |
| `external` | `ArrowUpRight` | EditorImage.tsx, App.tsx, Explorer.tsx, Breadcrumbs.tsx, WorkspaceMenu.tsx, GraphView.tsx, Board.tsx, PropertyValue.tsx, DocumentLink.tsx, TagView.tsx, CardPopup.tsx, SystemView.tsx |
| `popup` | `ExternalLink` | App.tsx, Board.tsx, BoardPdf.tsx, SystemView.tsx |
| `resize` | `ArrowDownRight` | EditorImage.tsx |
| `minus` | `Minus` | PdfReader.tsx, Board.tsx |
| `bold` | `Bold` | EditorControls.tsx |
| `italic` | `Italic` | EditorControls.tsx |
| `h1` | `Heading1` | EditorControls.tsx |
| `h2` | `Heading2` | Dynamic consumers; review before removal |
| `list` | `List` | TagView.tsx, EditorControls.tsx |
| `quote` | `Quote` | EditorControls.tsx |

## Outside the shared action-icon map

- PDF file identity: local PDF badge artwork in `BoardPdf.tsx`.
- Native emoji: `DocumentIcon` and the lazy-loaded Emoji Mart picker; preserve user choices.
- Whiteboard shapes and stroke/arrowhead previews: geometric SVG in `BoardObject.tsx` and `StyleView.tsx`.
- Resize corner, connector anchors, edge arrowheads, graph marks and History paths: functional geometry, not an interchangeable icon family.
- App logos: generated platform assets with separate release/Test sources; not part of the action-icon vocabulary.

## Review order

1. Popup versus new Tab versus external website; preserve the approved popup symbol.
2. Reload versus reset versus sync; graph Fit to view versus Fit sizes.
3. Whiteboard identity versus Show on whiteboard; History versus edges.
4. Normalize optical weight, control alignment and 16px legibility.
5. Compare only the remaining gaps with Tabler/Phosphor or a small custom set. Add no whole-family dependency until symbols are selected.
