# View blocks

View blocks work in Markdown cards and the Markdown body of `.tag` files. They store a query and named Table, List or Kanban views in a fenced `view-block`. Results reference source cards. Table, List and Kanban results edit source-card properties directly, as specified below. Opening or filtering a block still never changes a source card.

## Use in the app

In a card, show formatting controls and choose **Add view block** (database icon). In a tag page, choose **Add view block** below the existing views. This explicitly switches that tag page to saved blocks; old tag pages retain their existing property editing and Kanban behavior until a block is added. The tag schema remains in frontmatter, and view blocks live in its ordinary Markdown body.

The **Query** row controls all views. **Filter**, **Sort** and **View options** apply to the selected view. Use + to add another view, including another view of the same layout. View options supports naming, layout, visible properties, Kanban grouping, duplication, removing a view and editing the YAML. Removing a view/block never removes source cards. Edits use normal file revision checks and undo.

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

Built-in fields are `file.title` (falling back to filename), `file.path`, `file.folder`, `file.text` and `tags`. Text means meaningful Markdown content, excluding view-block source and file/layout metadata. Namespaced properties use their actual keys, including capitalization. The database reads these values from the rebuildable index; no centralized property schema is introduced.

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

Property suggestions come from positively selected tags and their inherited field definitions. Tag membership itself is exact: no implicit parent, descendant or inheritance expansion. Excluded tags do not add property suggestions. Previously saved conditions keep their explicit keys when the tag scope changes; unavailable definitions are reported rather than deleted or corrected.

## UI and validation

Use compact theme-aware controls. Query sits above the view tabs; current-view filter summaries sit below. Preserve nested Boolean meaning in summaries. A group’s Remove control belongs in its top-right corner, with the shared destructive hover/focus color. Its sibling conditions stay intact. Do not add explanatory Filter footers or empty-condition filler. Esc and outside click dismiss the popup without saving drafts; Done validates and saves.

Malformed YAML, unsupported versions, misspelled options/operators, unresolved property keys and incompatible types show an error inside the affected block. YAML syntax errors include the parser’s source location. Semantic errors identify the offending property/option. The raw source remains editable through **Edit YAML**. An error in one view leaves other views usable; a shared-query error affects all views. Unknown keys are never ignored to run a broader query. Invalid source values simply fail typed comparisons; per-card diagnostic counts and typo correction suggestions remain follow-up work.

Results show loading, empty and failure states separately. Requests are cancelled logically when source/view/workspace changes, including pagination. The index returns 100 references per page plus an exact total; Load more explicitly grows the result set. Kanban groups the loaded page and shows that partial count in the footer. It keeps approximately two card heights of breathing room below its longest column.

The implementation reuses the core SQLite index, fuzzy text search, theme tokens, popup placement, status colors and file-write/undo paths. The index now includes meaningful body text and rebuilds automatically when the cache version changes. No new runtime dependency or execution of user JavaScript is required. Gallery, Timeline and drag reordering of view tabs are deferred. Source-card property editing reuses the same editors as Card View, detailed below.

## Editable results

The earlier references-only limit is superseded. Table, List and Kanban results support editing their visible properties. Query evaluation remains read-only. A user's explicit property edit is a separate write to the referenced card's Markdown frontmatter. The block stores query and presentation only; it never stores a second copy of a card's values.

Reuse the same property editors as Card View: click a Status/Select pill for choices, click a date summary for the existing date/time/range popup, edit text/numbers without changing geometry, and use checkboxes for Boolean values. A property interaction must not open the card or start a drag; the title remains the explicit open action. Use only supported property types and existing tag definitions. Layout controls still configure the view, not source data.

Each committed edit uses source-file revision checks, preserves unrelated frontmatter and Markdown, participates in the shared undo history, updates the rebuildable index and refreshes other appearances of that card. Never overwrite a newer external edit. Keep an invalid or failed edit visible with a local error. A successful edit may move or remove the card from the current filtered view; wait until the value is committed and the editor closes before applying that result change. Do not change the filter or silently restore the old value to keep the card visible.

The current workspace merge setting determines editable property grouping. `project/Status` and `task/Status` remain separate stored properties even if their displayed values are equal. Never discard their source identity when rendering editable results. Inherited fields retain their original namespace. A missing value is still missing: merely viewing a result must not add a property, copy a default or attach a tag.

### Property merging and Kanban movement

- With **Merge properties across tags** on, one value editor updates every same-name, compatible field resolved through tags attached to that card, respecting **Case-sensitive property names**. The existing namespaced keys remain on disk. Inheritance retains the defining namespace; duplicate destinations are written once. All destinations validate before one atomic, undoable file write. Choice menus offer options accepted by every destination. Different property types or multiplicity stay separate.
- With merging off, fields appear separately with their tag names and edits affect only the chosen key. Display/edit grouping responds to settings immediately; saved query/filter/sort bindings keep their explicit keys. If a previously merged Kanban grouping now resolves to several separate fields, choose one under **View options → Group**.
- A column's property is its **Group** setting, normally Status. Dropping Todo → Done sets that property to Done. Cards can also move through their More menu. Pointer-down alone does nothing; movement starts after the shared drag threshold, uses the shared phantom, and Escape cancels. Unsupported destinations cannot accept a drop. The merge rules above apply to movement too.
- An explicit edit can add a missing value only for a field belonging to a tag already attached to the card. Merely opening, focusing, cancelling or blurring an unchanged editor does not add fields, attach tags or copy defaults. When displayed values differ, choosing an option or explicitly confirming an input applies that value to every matching destination.

The menu structure and density contract is in [Menus and tooltips](interactions/menus-and-tooltips.md#compact-menu-direction). These changes do not require a new query schema or a centralized property schema.
