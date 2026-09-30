# Tags

A tag defines properties; its table, list and Kanban show existing Markdown cards. There is no separate database container.

## Storage

New definitions live at `tags/<tag path>.tag`; definitions elsewhere are also indexed. The declared `tag` is its identity, independent of its filename. A duplicate identity is reported and blocks property writes.

```yaml
---
tag: project
inherits: []
fields:
  - key: status
    type: status
    statusGroups:
      todo: [Todo, Backlog]
      inProgress: [Doing, Review]
      done: [Done]
    default: Todo
---
```

A card stores `tags: [project]` and `project/status: Todo` in its frontmatter. Supported types: text, number, date, boolean, select, status, multi-select, card link (`card:<id>`), URL, email and phone. Multi-select values are YAML lists; empty values are null. Unknown frontmatter and note bodies are preserved. Regular UI hides YAML.

Status keeps editable option names under three fixed groups: `todo`, `inProgress`, `done`. Each option must occur in exactly one group. Cards store only the selected name, such as `project/status: Review`; moving Review to another progress group does not rewrite cards. Renaming/removing an option does not silently rewrite existing values: old values remain visible until explicitly reassigned. A Status override replaces the complete group mapping.

Date values are `YYYY-MM-DD` for a single all-day date, or an ISO timestamp with an explicit offset/`Z` for a time. A range is a mapping with `start` and `end` of the same kind; the end cannot precede the start. The UI offers End date and Include time switches. Date-only values never shift time zones; times display in the device’s local zone and new time edits serialize as UTC. Existing date-only values need no migration. Named time zones and recurrence are not supported yet.

```yaml
project/schedule:
  start: 2026-09-30
  end: 2026-10-03
```

Inheritance is explicit through `inherits`, not implicit from folder nesting. First inherited field with a matching key wins; `overrides` can change its definition, retaining the original property namespace; own fields win last. Options extend inherited options. Cycles, missing parents and duplicate definitions are reported. Adding a tag fills missing defaults without overwriting existing values. External files are indexed without inserting defaults automatically.

Removing a tag removes its owned values and inherited values no longer used by another attached tag, as one undoable edit after confirmation. Removing a field definition keeps existing card values. Field keys are fixed after creation; changing a label is safe. A later rename/migration flow must explicitly handle stored values.

## UI and queries

The Tags View creates and opens definitions. The definition section edits fields, options, defaults and inheritance. Tags sit directly below the reserved H1 in Card View and expanded whiteboard cards. Click a tag chip to expand/collapse its fields inline; editing uses the same layout. The metadata widget is not part of the editor document and is never serialized into Markdown. Expanded state survives preview/editor transitions during the session. Card View offers Add tag; on a whiteboard, use Add tag in the card menu.

Table cells edit original properties. Kanban groups by Select or Status fields, includes empty option columns and shows an unassigned column when needed, and writes the grouping property on drop; the More menu provides the same move by keyboard. Drag uses the shared phantom and a five-pixel threshold, with Escape/cancel cleanup. Views query the SQLite property index in 200-card pages, include descendant tags and support bilingual text filtering. Property link suggestions are bounded to 40 while editing. There is no filesystem scan per refresh.

Mutations pass through the existing revision-checked transaction and shared undo services. Definitions participate in Git history; view modes remain workspace layout state. The first slice does not migrate Obsidian tag hubs automatically, treat inline hashtags as attached schemas, execute DataviewJS, or provide saved multi-view query configuration or an inherited-field override editor.

## Property order

Drag a property label to reorder that card’s fields, with the shared vertical phantom/empty slot and 150ms neighbor animation. Alt+Up/Down is the keyboard equivalent. Values never initiate dragging. Escape/cancel/blur restores the order; release outside the list cancels. Only drop writes, through shared undo. Card-local order is YAML key order, preserving values, comments and note body; reordering does not change the `.tag` schema. Missing fields are materialized as null when explicitly reordered so their order can be retained.
