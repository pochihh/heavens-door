# Tags

A tag defines properties; its table, list and Kanban show existing Markdown cards. There is no separate database container.

## Storage

New definitions live at `tags/<tag path>.tag`; definitions elsewhere are also indexed. The declared `tag` is its identity, independent of its filename. A duplicate identity is reported and blocks property writes.

```yaml
---
tag: project
inherits: []
propertiesCollapsed: false
fields:
  - key: status
    type: status
    statusGroups:
      todo: [Todo, Backlog]
      inProgress: [Doing, Review]
      done: [Done]
    default: Todo
  - key: location
    type: text
    optional: true
    default: Taipei
---
```

The optional `propertiesCollapsed` boolean stores the tag page’s Properties section state in the `.tag` frontmatter; absent means expanded. It affects only presentation, survives reopening and ordinary schema edits, and participates in shared undo/history. Collapsing hides Default, Optional, Color and any open property editor, preserving its draft; Views remain visible.

A card stores `tags: [project]` and `project/status: Todo` in its frontmatter. Supported types: text, number, date, boolean, select, status, multi-select, card link (`card:<id>`), URL, email and phone. Multi-select values are YAML lists; empty values are null. Unknown frontmatter and note bodies are preserved. Regular UI hides YAML.

Status keeps editable option names under three fixed groups: `todo`, `inProgress`, `done`. Each option must occur in exactly one group. Cards store only the selected name, such as `project/status: Review`; moving Review to another progress group does not rewrite cards. Renaming/removing an option does not silently rewrite existing values: old values remain visible until explicitly reassigned. A Status override replaces the complete group mapping.

Date values are `YYYY-MM-DD` for a single all-day date, or an ISO timestamp with an explicit offset/`Z` for a time. A range is a mapping with `start` and `end` of the same kind; the end cannot precede the start. The UI offers End date and Include time switches. Date-only values never shift time zones; times display in the device’s local zone and new time edits serialize as UTC. Existing date-only values need no migration. Named time zones and recurrence are not supported yet.

```yaml
project/schedule:
  start: 2026-09-30
  end: 2026-10-03
```

Inheritance is explicit through `inherits`, not implicit from folder nesting. First inherited field with a matching key wins; `overrides` can change its definition, retaining the original property namespace; own fields win last. Options extend inherited options. Cycles, missing parents and duplicate definitions are reported. A field is automatic unless `optional: true`. Attaching a tag creates each missing automatic property with its default value, or null when it has no value, without overwriting stored values. Optional properties remain absent even when they have defaults. Explicitly adding one copies its current default (or null) into that card. Calling attach on an already attached tag is a no-op. External files are indexed without inserting fields or defaults automatically.

Removing a tag removes its owned values and inherited values no longer used by another attached tag, as one undoable edit after confirmation. Changing a definition—including defaults, membership, ordering and field options—writes only the `.tag` file. It does not backfill, clear, migrate or reset existing cards. Removing a field definition keeps existing card values visible; a field without its definition uses its stored value type for basic editing. Property definitions still provide shared labels and editing controls; this does not create historical copies of schema in every card. Field keys are fixed after creation; changing a label is safe. A later rename/migration flow must explicitly handle stored values.

## UI and queries

The Tags View creates and opens definitions. Its + stays enabled: with no name it focuses the name input; with a name it creates and opens the tag. A tag page starts with a `#tag` pill at the standard title size, previewing the shared workspace tag color on a neutral page background. Directly below the title, an Inherits row indented 24px with a bent-right arrow shows parent-tag pills and the same borderless fuzzy input as card tags, then Properties, the workspace color swatches, and Views (Table/List/Kanban). Properties has Default above Optional, followed by Color, all using matching quiet labels aligned with Properties at the left and thin dividers extending to their right, with no box border. Both sections reuse the exact card property label/value components. Editing a value here saves its template default, never card values. Click a property label to edit its type/label/options; right-click also offers moving between default and optional or removing its definition. Property labels use the shared vertical drag to reorder or move between Default and Optional, including empty sections. The Properties heading has Add property and an up/down collapse control on the right. Add property is hidden while collapsed. Its menu creates optional fields; drag a field to Default for automatic inclusion when tagging new cards. Inherited fields keep their original namespace and open their source definition for editing. The parent input reuses the core fuzzy search and can create a parent definition and attach it in one undoable transaction. Self and descendants are excluded to prevent cycles. Click a parent pill to open its tag page; right-click to open or remove it. A click while its menu is open only closes the menu. Horizontal drag or Alt+Left/Right reorders parents; first-parent precedence follows their order. Parent changes write the `.tag` file without rewriting existing cards. Tags sit directly below the reserved H1 in Card View and expanded whiteboard cards. The row contains one tag icon, `#tag` pills and a borderless input. Pills act as tabs: clicking one shows only its properties, clicking it again closes the panel, and the leading icon closes an open panel or reopens the last-used tag (falling back to the first attached tag). Pills have no disclosure arrow, and the panel does not repeat the tag name. The active pill has an accent outline, stronger label and an inline More button (`#project …`). Right-click any pill or use that More button for definition/removal actions. While its menu is open, clicking the same pill or More button only dismisses the menu; it never changes property selection. The properties panel has only thin top/bottom dividers, with no side border or panel-level More button. Cards show only property keys actually stored in their frontmatter. Add property first lists available defined fields (optional fields first, with default values), followed by a divider and the standard property types. Selecting an existing field writes only this card. Selecting a type opens the shared editor; its value belongs to the card. Saving creates the card property and registers an optional field in the `.tag` file as one revision-checked, journaled, undoable transaction. The entered card value does not become a template default. Cancel/Escape discards the draft. Editing uses the same layout. The metadata widget is not part of the editor document and is never serialized into Markdown. Expanded state survives preview/editor transitions during the session. The borderless input fills the remaining row width, with at least 100px available even when pills scroll; parent tags use the same shared input. Typing in the input queries the core fuzzy/bilingual search index for existing unattached tags and an explicit Create option. Up/Down, Enter and Escape work without moving focus into suggestions; outside click dismisses them. Creating and attaching a definition is one revision-checked, undoable transaction. Tagged whiteboard cards use the same input; untagged canvas cards also offer Add tag in their More menu. Boolean property values use native checkboxes; date-control settings remain switches.

Table cells edit original properties. Kanban groups by Select or Status fields, includes empty option columns and shows an unassigned column when needed, and writes the grouping property on drop; the More menu provides the same move by keyboard. Drag uses the shared phantom and a five-pixel threshold, with Escape/cancel cleanup. Views query the SQLite property index in 200-card pages, include descendant tags and support bilingual text filtering. Property link suggestions are bounded to 40 while editing. There is no filesystem scan per refresh.

Mutations pass through the existing revision-checked transaction and shared undo services. Definitions participate in Git history; view modes remain workspace layout state. The first slice does not migrate Obsidian tag hubs automatically, treat inline hashtags as attached schemas, execute DataviewJS, or provide saved multi-view query configuration or an inherited-field override editor.

## Property order

Drag a property label to reorder that card’s fields, with the shared vertical phantom/empty slot and 150ms neighbor animation. Alt+Up/Down is the keyboard equivalent. Values never initiate dragging. Escape/cancel/blur restores the order; release outside the list cancels. Only drop writes, through shared undo. Card-local order is YAML key order, preserving values, comments and note body; reordering does not change the `.tag` schema. Only present keys participate; reordering never materializes fields that are absent from the card.


## Tag order and colors

Drag pills horizontally with the shared phantom/empty slot, or use Alt+Left/Right. Drop saves the ordered `tags` array in that card’s frontmatter through shared undo; fields, values, comments and body remain unchanged. Escape or dropping outside cancels. A valid drop activates the dragged tag and opens its properties, including a drop back into its original slot; cancelled drags preserve the previous active tag. Alt+Left/Right also activates the reordered tag.

The tag page Color swatches and Settings → Tag colors assign a literal six-digit hex color to each tag, shared by its pills throughout the workspace. The `tagColors` mapping lives in `.heavens-door/settings.json`, outside content history. Reset removes the mapping; theme colors then apply. The existing workspace palette/custom hex picker is reused. Editing a palette swatch does not recolor tags already assigned its old hex value; assigning a new tag color intentionally updates all its pills. Theme blending controls surface appearance.


## Indexed reads and write boundaries

Card properties are plain YAML values; there is no per-card schema version, virtual default, or separate database record to keep in sync. SQLite's derived `properties` index powers queries and views, and the shared text index searches namespaced values. Both update through the existing write/refresh paths, including external file edits. Adding a new card-local field checks both file revisions before either write; undo restores both. Choosing an existing property changes only the card. The tag definition, card body, unrelated frontmatter and other cards remain intact.
