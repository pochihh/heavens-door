# View blocks

View blocks work in Markdown cards and the Markdown body of `.tag` files. They store a query and named Table, List or Kanban views in a fenced `view-block`. Results are read-only references to source cards. Opening or filtering a block never changes those cards.

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

The implementation reuses the core SQLite index, fuzzy text search, theme tokens, popup placement, status colors and file-write/undo paths. The index now includes meaningful body text and rebuilds automatically when the cache version changes. No new runtime dependency or execution of user JavaScript is required. Gallery, Timeline, drag reordering of view tabs and source-card writeback from blocks are deferred.
