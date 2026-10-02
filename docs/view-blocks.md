# View blocks

Status: agreed format direction and proposed UI, not yet integrated into the app. The existing tag Table/List/Kanban implementation remains the current shipped implementation. The shared block is intended for both ordinary Markdown notes and tag pages.

## File contract

A fenced `view-block` contains readable YAML. It stores a query and one or more named views; results are references, never copied card content. The shared query and current view filter both apply (AND). A view cannot broaden its query. Views can use the same layout with different filters, sorting or visible properties.

````markdown
```view-block
version: 1
query:
  from: cards
  where:
    all:
      - {field: tags, op: contains, value: project}
      - {field: file.folder, op: under, value: Projects}
views:
  - id: active
    name: Active tasks
    type: table
    filter:
      all:
        - {field: project/Status, op: neq, value: Done}
    fields: [file.title, project/Status, project/Schedule]
  - id: complete
    name: Completed
    type: table
    filter: {field: project/Status, op: eq, value: Done}
    fields: [file.title, project/Schedule]
  - id: board
    name: Board
    type: kanban
    groupBy: project/Status
```
````

Property references use actual namespaced file keys. `file.*` identifies built-in file fields. `file.text` searches meaningful title/body text, excluding whiteboard geometry and other layout metadata. Tag definitions retain YAML frontmatter for inheritance and property templates, with ordinary Markdown and the same view blocks in their body. Do not change or backfill existing card data to render a view.

Both query and view filters use the same nested condition language: `all` means every condition, `any` means at least one, and `not` negates a condition. Support typed equality, text contains/starts/ends, numeric comparisons, date comparisons and ranges, tag membership, and explicit missing/empty checks. Fuzzy search is a distinct operation using the core search service, not a substitute for substring matching. Time comparisons use calendar dates for all-day values and absolute instants for timestamps. Relative values such as `{relative: today, days: 7}` use workspace timezone unless explicitly configured. The complete operator schema and query compiler remain implementation work.

## Block chrome

Use a small shared Query row above the view tabs. It summarizes the common collection with quiet chips such as `#project` and `Projects/`, and an `All views` scope label. Empty query conditions read `All cards`. More complex queries display a condition summary rather than a misleading flat list. Clicking the row opens the editor labelled `Query`. The visible block-level row already communicates its scope; do not repeat an explanation in the popup.

Below it, show content-width view tabs with a layout icon and user-chosen name, followed by + Add view. Highlight the active tab clearly using the existing app active treatment. Several views of the same type are permitted. The right side contains Filter, Sort and View options; avoid an always-expanded search field and duplicate layout buttons. At narrow pane widths, move the tools onto a second line and put excess view tabs behind an overflow menu.

Current-view filter chips sit immediately below the tabs, followed by the results. Query chips and view filter chips occupy different rows so their scope is visible. A filter chip uses a readable phrase such as `Status is not Done` or `Priority is at least 3`. Grouped or OR filters must display `Any of …` or a group summary; never flatten them into chips that imply AND. Clicking a chip opens its condition editor. Filter shows the number of current-view rules. No conditions means no empty chip row.

## Simple filtering first

Filter opens an anchored popup headed `Filter · <view name>`. A basic condition is a single row: property, comparison, value. Start with one condition; do not expose a Boolean mode selector until there is more than one. With multiple conditions show `Match all conditions` / `Match any condition`, never raw YAML terms or SQL abbreviations. Choose the property first, then present only comparisons and value controls valid for its type.

Use existing controls: fuzzy property/tag suggestions, colored Status/Select choices, number inputs, calendar/date popups, and reference pickers. Display familiar phrases: `contains`, `is at least`, `is before`, `is empty`. Namespace labels appear where needed to distinguish identically named properties. Missing values are not silently treated as zero or an empty string.

`Add condition` adds a sibling. A secondary `Add group` exposes nested all/any logic with a thin indentation guide. Group controls stay local to their group; the group can be removed without deleting its siblings. Ordinary users never need to open this path. Keep the popup limited to its condition rows and actions. Omit scope explanations, empty-condition messages and the From query / Edit query footer; the Query row above the tabs owns shared restrictions.

Query and Filter reuse the same editor, with explicit scope. Query edits update all view tabs; Filter edits affect only the current tab. Only valid, committed changes persist; incomplete drafts keep the last valid result rather than briefly broadening the query. Show input validation beside the relevant field. Escape cancels an unfinished field edit and dismisses the popup; outside click dismisses it. Do not show tooltips just because a popup opens. Restore focus to the trigger. Query/filter edits use the app's normal undo and file revision checks.

## Tag scope and query validation (proposed)

The following rules are design recommendations pending discussion, not a shipped query compiler.

Start query editing with tag membership: all selected tags, any selected tag, and excluded tags. Keep Boolean meaning explicit when combining groups; the same `all` / `any` / `not` condition language remains the file representation. Scope is a UI step, not a new centralized schema. Built-in filename, folder, meaningful text and timestamp fields remain available without choosing a tag.

Offer properties from positively selected tags and their resolved inherited definitions, grouped by tag and searchable through the reusable core fuzzy search. Excluded tags do not add property options. Current-view filters start with the shared query’s tag scope and may narrow it. Do not derive available properties from the currently matching rows: an empty result must not erase choices. If a scope edit leaves a condition outside the selected tags, retain and flag it for review; never delete or retarget it automatically. Complex handwritten Boolean expressions must retain their grouping when shown in the editor rather than being flattened into misleading scope chips.

A property’s stored identity is its actual namespaced key, such as `project/Status`. Inheritance retains the defining tag’s key. The recommended picker keeps equal-looking names from different tags separate; whether to additionally offer a combined name-and-type condition is still open. Definitions remain in local `.tag` files, values remain in each card’s frontmatter, and any database catalog is only a rebuildable index. Do not rename, merge, coerce or correct user data automatically.

Before implementation, settle these semantics: exact versus inherited tag membership; matching absent, empty or mistyped values; querying historical keys whose definitions have been removed; and date-range comparisons. Recommended defaults are explicit tag membership, typed comparisons that require a present valid value, and separate missing/empty operators. A property missing from one side of an OR tag query is normal, not a schema error. A tag’s template default is not a fallback value for cards that do not store that property. Negation must have documented behavior for absent values rather than accidentally treating absence as a value.

For handwritten YAML, show validation within the affected block, not repeated modal warnings. Identify the source line/column and offending field or operator. Offer fuzzy suggestions as explicit corrections, never silently apply them. Preserve the raw source. Malformed syntax, unsupported versions/operators and unresolved or ambiguous property bindings must never be ignored to run a broader query. A shared-query error affects every view; an error confined to one view affects that view only. During a draft, a last-valid preview can remain visibly labelled as previous results; opening an invalid saved block shows its error rather than silently presenting stale data. Valid zero matches is an ordinary empty result. Invalid values in individual source cards should be distinguishable from an invalid query, with affected values excluded from typed comparisons and a compact, expandable diagnostic.

## View management and results

Add view asks for a name and layout. It starts with the block query and no extra filters. View options contains Rename, Duplicate, Layout, Properties and Remove view. Duplicate copies the current view's filter, sort, group and visible properties. Removing a view or block never deletes source cards. Stable IDs keep view identity across rename/reorder; use the existing drag phantom for tab reordering when integrated. Visible property toggles are settings switches, not data checkboxes.

The first embedded views are read-only references: no New card row, inline property writes, Kanban moves or Timeline resize handles. A card opens through existing navigation actions. The existing tag-specific editing controls need an explicit integration decision when replaced by the shared block; do not silently change their behavior during this design pass.

Reuse Table/List/Kanban initially, then add Gallery and Timeline through the same query/result contract. Tables use quiet dividers and consistent property display. Kanban keeps about two compact cards of drop-space-sized breathing room below the longest column even when read-only. Gallery uses lightweight previews; Timeline requires a date property. Status colors follow the same progress groups everywhere. Omit unrelated database features such as templates, automations, AI autofill, forms and collaboration controls.

A loading state preserves existing layout while the current request runs. Distinguish an empty query result from errors and loading. Large results use indexed pagination; counts and grouping must not imply a partial page is the entire collection. Reuse the core query and text search engines rather than scanning files in the renderer. The filesystem is authoritative; database indexes are rebuildable. Preserve raw blocks and unknown fields losslessly, and show recoverable errors for unsupported or malformed definitions instead of rewriting them.
