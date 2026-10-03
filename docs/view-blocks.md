# View blocks

View blocks work in Markdown cards and the Markdown body of `.tag` files. They store a query and named Table, Kanban, Gallery or Timeline views in a fenced `view-block`. Results reference source cards. Table has Grid and Compact appearances: Grid edits source-card properties directly, while Compact uses aligned rows that open the card popup. Kanban cards show read-only property previews; click anywhere on the card to edit it in the shared card popup. Opening or filtering a block still never changes a source card.

## Use in the app

In a card, show formatting controls and choose **Add view block** (database icon). In a tag page, choose **Add view block** below the existing views. This explicitly switches that tag page to saved blocks; old tag pages retain their existing property editing and Kanban behavior until a block is added or a Kanban card is explicitly reordered. That first reorder saves equivalent views in a block. The tag schema remains in frontmatter, and view blocks live in its ordinary Markdown body.

The block header is **Name · Query …**: its name edits in place, Query controls all views, and the right-hand More menu renames, duplicates, edits YAML or deletes the whole block. The optional top-level `name` is saved only when edited; unnamed existing blocks display “View block” without rewriting their file. **Filter**, **Sort** and **View options** apply to the selected view. Use + to add another view, including another view of the same layout. View options supports naming, layout, visible properties, Kanban grouping, duplication and removing a view. The last view cannot be removed through its tab menu; use Delete view block. Removing a view/block never removes source cards. Edits use normal file revision checks and undo.

## File contract

````markdown
```view-block
version: 1
query:
  from: cards
  where:
    any:
      - {field: tags, op: contains, value: project}
      - {field: tags, op: contains, value: task}
views:
  - id: active
    name: Active tasks
    type: table
    filter:
      all:
        - {field: [project/Status, task/Status], op: eq, value: Todo}
    fields: [file.title, [project/Status, task/Status]]
    sort: {field: file.title, direction: asc}
  - id: board
    name: Board
    type: kanban
    groupBy: [project/Status, task/Status]
```
````

The shared query AND the current view filter must both match. A view cannot broaden the query. `all` requires every condition, `any` requires at least one, and `not` negates one condition. Empty `all` matches all cards; empty `any` matches none. Groups nest up to eight levels and contain at most 100 conditions per rule tree. Blocks support up to 20 views.

Built-in fields are `file.name` (filename without the extension), `file.title` (falling back to filename), `file.path`, `file.folder`, `file.text` and `tags`. Text means meaningful Markdown content, excluding view-block source and file/layout metadata. Namespaced properties use their actual keys, including capitalization. The database reads these values from the rebuildable index; no centralized property schema is introduced.

| Type | Comparisons |
| --- | --- |
| Text | `eq`, `neq`, `contains`, `notContains`, `starts`, `ends` |
| Number | `eq`, `neq`, `gt`, `gte`, `lt`, `lte` |
| Checkbox | `eq`, `neq`, using YAML `true`/`false` |
| Date | `on`, `before`, `after`, using ISO dates/timestamps |
| Select / Status | Equality and text comparisons |
| Multiple choice / Tags | Exact `contains`, `notContains` membership |
| Link | `eq`, `neq` |
| All fields | `exists`, `missing`, `empty`, `notEmpty` |
| Folder | Also `under`, including descendants |

Text substring/start/end comparisons ignore ASCII case; equality and tag membership are exact. Fuzzy matching belongs to the shared tag/property picker search, not the stored substring operator. Date comparisons use the start of a stored date range. `before`/`after` compare timestamps as instants, while `on` compares their SQLite calendar-date interpretation (UTC for timestamp offsets). The current filter UI provides an all-day date input; timestamps can be entered in YAML. Relative dates, range-overlap operators and workspace-timezone day boundaries are follow-up work, not accepted silently.

## Missing values and merged properties

Missing, null and mistyped property values do not satisfy ordinary comparisons. A template default is never substituted for an absent value. `missing` means the key is absent; `empty` includes absent keys, null, empty strings and empty arrays. Zero and false are real values. Logical negation retains an unknown comparison as unknown, so `not: {field: project/Priority, op: eq, value: 3}` still excludes cards with no valid Priority. Use an explicit `missing`/`empty` condition to include them. Tags are membership rather than a scalar value: “not tagged project” includes untagged cards.

**Settings → Views and queries** has two workspace preferences:

- **Merge properties across tags** defaults On. Pickers group matching property names with compatible types and multiplicity.
- **Case-sensitive property names** defaults Off. Turning it on separates `Status` from `status` when merging.

A grouped field saves an explicit array of exact source keys, such as `[project/Status, task/status]`. It never renames or merges file data. Changing settings later changes future picker choices, not existing saved query bindings. Each ordinary comparison can match any listed key; missing/empty require all listed keys to be missing/empty. A row with two distinct stored values displays both. Grouping may place that reference in both matching Kanban columns. Sorting uses the first non-null key in the saved order.

Property suggestions come from positively selected tags and their inherited field definitions. Tag membership itself is exact: no implicit parent, descendant or inheritance expansion. Excluded tags do not add property suggestions to the condition editor. Presentation menus (Properties, Group and Sort) also retain configured fields. For queries without positive tag conditions, these menus offer fields defined by tags on the loaded matching cards, so visible properties can be hidden and shown again. Display grouping follows the workspace merge and case settings. Previously saved conditions keep their explicit keys when the tag scope changes; unavailable definitions are reported rather than deleted or corrected.

## UI and validation

Use compact theme-aware controls. Query sits above the view tabs; a funnel button opens the current-view filter. Query and filter expressions appear only inside their editors. Keep nested Boolean groups explicit inside those editors. A group’s Remove control belongs in its top-right corner, with the shared destructive hover/focus color. Its sibling conditions stay intact. Do not add explanatory Filter footers or empty-condition filler. Esc and outside click dismiss the popup without saving drafts; Done validates and saves.

Malformed YAML, unsupported versions, misspelled options/operators, unresolved property keys and incompatible types show an error inside the affected block. YAML syntax errors include the parser’s source location. Semantic errors identify the offending property/option. The raw source remains editable through **Edit YAML**. An error in one view leaves other views usable; a shared-query error affects all views. Unknown keys are never ignored to run a broader query. Invalid source values simply fail typed comparisons; per-card diagnostic counts and typo correction suggestions remain follow-up work.

Results show loading, empty and failure states separately. Requests are cancelled logically when source/view/workspace changes, including pagination. The index returns 100 references per page plus an exact total; Load more explicitly grows the result set. Kanban pages each column independently, after applying its saved order, and shows full column counts and the loaded total in the footer. It keeps approximately two card heights of breathing room below its longest column. View blocks grow to their full content height and use the surrounding page for vertical scrolling. Kanban columns share available width from a 240 px minimum up to 400 px; narrow panes scroll horizontally.

The implementation reuses the core SQLite index, fuzzy text search, theme tokens, popup placement, status colors and file-write/undo paths. The index now includes meaningful body text and rebuilds automatically when the cache version changes. No new runtime dependency or execution of user JavaScript is required. View tabs reorder by dragging or Alt+Left/Right; their order is the `views` array in the owning file. Drops stay within one block, activate the moved view and use the shared tab drag visuals. Cancelling writes nothing. Add view immediately follows the last tab. Left-click only activates a view tab. Right-click opens that tab’s menu for renaming, duplicating, deleting and configuring the view; the toolbar More button also opens this menu. Deleting the only view removes the block; it does not delete any source cards. These changes remain undoable. Setup controls remain available in document preview and editing; preview saves replace only the matching YAML fence, preserving surrounding Markdown and using revision checks and undo. Source-card property editing reuses the same editors as Card View, detailed below.

## Editable results

Grid Table results support editing their visible properties. Compact Table, Gallery and Kanban cards are read-only previews: title, property labels and values all open the shared editable card popup. Only More remains a separate card action. Titles keep keyboard button semantics without an independent hover background; property previews have no buttons, inputs or hover treatment. Query evaluation remains read-only. A user's explicit property edit is a separate write to the referenced card's Markdown frontmatter. The block stores query and presentation only; it never stores a second copy of a card's values.

In Grid Table, reuse the same property editors as Card View: click a Status/Select pill for choices, click a date summary for the existing date/time/range popup, edit text/numbers without changing geometry, and use checkboxes for Boolean values. A property interaction must not open the card or start a drag; the title remains the explicit open action. Use only supported property types and existing tag definitions. Layout controls still configure the view, not source data.

Each committed edit uses source-file revision checks, preserves unrelated frontmatter and Markdown, participates in the shared undo history, updates the rebuildable index and refreshes other appearances of that card. Never overwrite a newer external edit. Keep an invalid or failed edit visible with a local error. Preserve the active view and Kanban scroll position across file updates. Keep rendered blocks mounted when their YAML changes. Show a dropped card in its new slot immediately, retain the existing results during the save and background refresh, and restore the previous placement if the save fails. A successful edit may move or remove the card from the current filtered view; wait until the value is committed and the editor closes before applying that result change. Do not change the filter or silently restore the old value to keep the card visible.

The current workspace merge setting determines editable property grouping. `project/Status` and `task/Status` remain separate stored properties even if their displayed values are equal. Never discard their source identity when rendering editable results. Inherited fields retain their original namespace. A missing value is still missing: merely viewing a result must not add a property, copy a default or attach a tag.

### Property merging and Kanban movement

- With **Merge properties across tags** on, one value editor updates every same-name, compatible field resolved through tags attached to that card, respecting **Case-sensitive property names**. The existing namespaced keys remain on disk. Inheritance retains the defining namespace; duplicate destinations are written once. All destinations validate before one atomic, undoable file write. Choice menus offer options accepted by every destination. Different property types or multiplicity stay separate.
- With merging off, fields appear separately with their tag names and edits affect only the chosen key. Display/edit grouping responds to settings immediately; saved query/filter/sort bindings keep their explicit keys. If a previously merged Kanban grouping now resolves to several separate fields, choose one under **View options → Group**.
- A column's property is its **Group** setting, normally Status. Dropping Todo → Done sets that property to Done. Cards can also move through their More menu. Pointer-down alone does nothing; movement starts after the shared drag threshold, uses the shared phantom, and Escape cancels. Unsupported destinations cannot accept a drop. The merge rules above apply to movement too.
- An explicit edit or drop from No value can add a missing property. If no compatible attached tag defines it, attach the tag that defines the selected view property and write only the chosen value; do not copy unrelated defaults. Merely opening, focusing, cancelling or blurring an unchanged editor does not add fields, attach tags or copy defaults. When displayed values differ, choosing an option or explicitly confirming an input applies that value to every matching destination.

The menu structure and density contract is in [Menus and tooltips](interactions/menus-and-tooltips.md#compact-menu-direction). These changes do not require a new query schema or a centralized property schema.

### Manual Kanban order

Sort offers **File name**, **Tags**, and, for Kanban, **Manual**. Kanban defaults to Manual; other layouts default to File name. Tags are compared as alphabetically sorted sets, so A/B and B/A sort equally without changing their order in any card. Table also lists visible properties in Sort, with ascending/descending direction. Grid headers expose the same direction controls. An explicit Kanban positional drop switches to Manual, freezing the displayed order of every column before applying the drop. Dragging and swap previews work under every sort. Cancelling does not change the sort.

Each view can optionally store `order` (up to 10,000 IDs across 200 columns; blocks are limited to 1,000,000 characters), a mapping from the exact column value to an array of `card-id` strings. The empty-string key represents No value. This is presentation data in the block's owning Markdown or `.tag` file; card content stays in its source file.

```yaml
order:
  Todo: [card-b, card-a]
  "": [card-c]
```

Omit `order` until the user actually changes a position. An explicit drop records all current IDs in the destination column, including unloaded matches; untouched columns do not get order arrays unless the drop switches from a property sort to Manual. New matches absent from the saved array append at the bottom and remain unsaved until that column is reordered. Initial unsaved order uses filename/path sorting; subsequent arrivals append for the current app session. After restarting, unsaved arrivals use filename/path sorting below saved IDs.

On refresh, match saved IDs against the current query using maps and sets. Ignore absent IDs for display; retain them on disk so a temporary filter does not erase positions. Querying, opening, pagination and refresh never write order or clean up files. The index reads compact metadata for grouping and ordering, then loads the displayed references. A bounded in-memory tail preserves new-arrival order without adding a persistent cache or modifying notes.

A drop between columns updates the grouping property and the view order in one revision-checked, undoable transaction. Existing cards with merged properties follow the same validation rules as other view edits. Cancelling a drag or dropping back into the original slot writes nothing. Filtering a moved card out is allowed: the query remains unchanged.

The development-machine benchmark (`npm run benchmark`) with 10,000 cards measured 29.58 ms median and 38.53 ms p95 for the indexed Kanban query, including order reconciliation and the first 100 references per column. This excludes IPC and rendering; actual content and hardware affect results.

## Table appearances

Use `type: table` with optional `appearance: grid | compact`; omitted appearance means Grid. The toolbar’s Compact mode toggle changes presentation only; Table uses a List icon in view tabs. Existing `type: list` views remain valid and display as Compact without rewriting files on open. Toggling Compact mode next to Filter saves `type: table` and the selected appearance. New view menus offer Table, Kanban, Gallery and Timeline.

## Gallery, Timeline and creation

Gallery shows the first local Markdown/HTML image in each card, or a text excerpt. Preview text and paths are derived from the indexed body using the search parser; only displayed results are parsed and cached. Images load lazily through the workspace asset handler. Card fill color follows the source card. Table uses aligned columns that do not stretch across spare pane width; narrow panes scroll horizontally. Its default Grid appearance has property headers, subtle cell rules and editable cells. Compact has no header or cell rules and opens the card popup when a row is clicked. Both appearances keep the same query, filters, visible properties and sorting. Grid also offers sorting in property headers; the Sort menu provides visible properties and direction for either appearance. Gallery clicks also open the shared card popup.

Timeline uses `type: timeline`, `dateBy: project/Date` (a date field or compatible merged fields) and optional `scale: day | week | month`. Drag a bar to reschedule both endpoints; drag either end to resize a range. At Week/Month scale, all-day values remain all-day. Day-scale movement converts a date-only value to a timestamp in the workspace timezone; resizing creates a timed range. Timed values follow the workspace timezone and snap to 15 minutes at Day scale or one day at Week/Month scale. Invalid date/time changes fail without writing. Click a bar to open the card, or use the source card/date popup for keyboard date editing. Month/day rulers show a today line and quiet weekend shading. Card names can extend beyond short fills and shift within the viewport without changing date-bar boundaries. Scale choices use the shared anchored menu. Unscheduled cards sit in a bottom collapse as wrapping, name-sized timeline previews and can be dragged onto a date/time to schedule them. The timeline uses the same paged query as other layouts; Load more expands it.

Every layout has New card. Kanban also has New card in each column; Timeline has an empty creation row where a hover ghost previews a date/time, clicking sets it and dragging previews a range before creation. Creation applies required tags and their default properties first, unambiguous exact query/filter values second, and the clicked column/date last. No value explicitly overrides a default Status. Optional properties remain absent unless a predicate or column/date requires them. OR alternatives and merged-key alternatives prompt for a choice. Negative, substring and inequality predicates are not invented defaults; a new card opens in the popup so it can be completed even if it does not yet match every predicate. The query remains unchanged.

An unambiguous folder predicate supplies the destination; otherwise use the configurable root-level **New card folder**, initially `Inbox`. This is an ordinary folder, not a whiteboard. Creation does not generate an Inbox `.whiteboard`. A real destination board automatically includes the new card through its existing placement reconciliation. Cards, defaults and board placement save in one undoable transaction. Changing the setting affects future creation and does not rename an existing folder.

### Timeline placement and sorting

Bars appear only when their schedule intersects the visible horizontal window. Each other scheduled card keeps its row and shows a pinned left/right arrow at the visible edge; hover reveals its name, and click navigates to its schedule. Resize handles use an east–west cursor. Grips at both visible row edges use hand cursors and the shared vertical phantom, insertion slot and neighbor animation. Only the card paints a fill in that phantom; the rest of the row stays transparent. Reordering cannot change dates. Alt+Up/Down is the keyboard alternative. Cancellation writes nothing. Dragging empty canvas pans horizontally through dates with a hand cursor, including beyond the initial date buffer. It does not change card dates or save view order; Escape restores the prior viewport.

Sort offers Start date/time and End date/time, using the configured date property, for example:

```yaml
sort: {field: project/Date, part: end, direction: asc}
```

`part` is optional (defaults to `start`) and only applies to date properties. A single date is both its start and end. Missing dates sort last. Values are compared as dates/timestamps rather than serialized JSON.

A row reorder switches to `sort: manual` and lazily creates `order: {rows: [card-id, ...]}` in that view. It does not alter any source card. The index reconciles matching IDs before pagination, retains hidden saved IDs, and keeps new arrivals at the end without writing during refresh. Other views keep their own ordering.

View-filter property pickers inherit the block query’s scope: explicitly selected query tags plus tags attached to query matches, before the view’s filter or pagination. They do not require repeating tag conditions in each view. Definitions still come from `.tag` files, without a central schema.
