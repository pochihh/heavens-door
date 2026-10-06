# Templates and Journal

**New from template** in the top bar opens a searchable picker. Templates are ordinary Markdown files in `Templates/` by default. Create or edit one from the picker; its HTML, properties and relative image links are retained when creating a note. The new note gets its own card ID. Settings → Templates changes the folder. New notes use the configured unplaced-card folder, now `Slipbox` by default; existing configured locations are preserved.

Variables are `{{title}}`, `{{date}}`, `{{time}}`, and formatted dates such as `{{date:MMMM D, YYYY}}`. Supported tokens: `YYYY`, `YY`, `MMMM`, `MMM`, `MM`, `M`, `DD`, `D`, `dddd`, `ddd`, `GGGG`, `WW`, `W`, `HH`, `H`, `hh`, `h`, `mm`, `ss`, `A`. Literal text in formats goes in square brackets. These are a small portable subset of Obsidian’s date-format syntax; executable template scripts are not supported. Quote variables used as YAML values. A template is copied once; editing it never modifies notes already created.

The dockable Calendar View opens from the Action Ribbon. Days create or open daily notes; week numbers create or open weekly notes. Navigation and changing the display do not create files. Weeks start on Monday and use ISO week numbering. Today follows the workspace date timezone and shares the app’s red date marker.

Calendar shows a month grid. Dots mark existing notes and increase with the current word count (one dot per 250 words, up to four). Existing empty notes retain one dot. Counts include template text and come from the rebuildable file index.

Settings → Journal controls the folder, daily/weekly filename formats, and separate templates. Choose a date-format preset or Custom; the complete output path previews below it. Invalid formats stay in the input until corrected and are not saved. Default files are `Journal/YYYY/MM/YYYY-MM-DD.md` and `Journal/Weekly/GGGG-[W]WW.md` (for example `Journal/Weekly/2026-W41.md`). Template dates use the chosen day, or Monday for a weekly note; time uses the creation time in the workspace timezone.

New journal notes record readable metadata alongside their normal card ID:

```yaml
journal:
  date: 2026-10-05
  period: daily
```

The date stays an all-day ISO string. Weekly notes store their Monday and `period: weekly`. This identity survives file renames and moves. Existing notes at the configured date path open without changes; they are recognized by that naming convention until given explicit journal metadata. Duplicate explicit journal identities are reported instead of selecting one silently. Existing files are never overwritten. Creation uses the normal recoverable transaction and undo/redo flow; the database can be deleted and rebuilt from Markdown.

## Named inputs and includes

Use `{{input:project}}` wherever an answer belongs. Repeated names share one answer, including across included templates. Undeclared inputs are required text fields. Optional definitions live in the template's YAML:

```yaml
---
template:
  inputs:
    project:
      label: Project
      type: text
    priority:
      type: number
      default: 3
    reviewed:
      type: checkbox
      default: false
    mood:
      options: [Good, Okay, Low]
      default: Okay
    participants:
      required: false
project/Priority: "{{input:priority}}"
---
```

Supported input types are text, number, checkbox, date, choice, note, and tag. A note picker writes a stable `card:id` reference; tag pickers write the tag name without `#`. Both reuse fuzzy search. A whole YAML value such as `"{{input:priority}}"` retains the answer's number/boolean type; mixed text becomes a string. Template configuration is removed from the generated note. Answers are inserted once as data and never evaluated as more template syntax.

`{{include:Templates/Review checklist.md}}` copies that file's body. Paths are workspace-relative. Includes can be nested, share input definitions, and expand date/time/title variables in the new note's context. Their frontmatter properties are ignored. Relative Markdown and HTML image/link paths are rebased from each source template to the new note. Missing files, circular includes, conflicting input definitions, and invalid answers prevent creation. Existing notes remain independent of later template edits.

The template picker collects all inputs in one form. Calendar requests them only for a new daily or weekly note; reopening an existing journal does not apply a template again.

## Editable feature notes

Opening a special-folder view creates its guide if absent: `template.md`, `journal.md`, `slipbox.md`, `tags.md`, or `trash.md`, in the feature's configured folder. No whiteboard file is created. These are ordinary Markdown cards with a card ID; existing files and user edits are never replaced. Each view shows **Notes** above its calendar/search/list, collapsed by default. **Edit notes** opens the normal card popup. Guide files are excluded from feature lists and template selection but remain accessible through normal note navigation. Changing a feature's folder uses a guide in the newly selected folder and retains the old files.
