# Templates and Journal

**New from template** in the top bar opens a searchable picker. Templates are ordinary Markdown files in `Templates/` by default. Create or edit one from the picker; its HTML, properties and relative image links are retained when creating a note. The new note gets its own card ID. Settings → Templates changes the folder.

Variables are `{{title}}`, `{{date}}`, `{{time}}`, and formatted dates such as `{{date:MMMM D, YYYY}}`. Supported tokens: `YYYY`, `YY`, `MMMM`, `MMM`, `MM`, `M`, `DD`, `D`, `dddd`, `ddd`, `GGGG`, `WW`, `W`, `HH`, `H`, `hh`, `h`, `mm`, `ss`, `A`. Literal text in formats goes in square brackets. These are a small portable subset of Obsidian’s date-format syntax; executable template scripts are not supported. Quote variables used as YAML values. A template is copied once; editing it never modifies notes already created.

The dockable Calendar View opens from the Action Ribbon. Days create or open daily notes; week numbers create or open weekly notes. Navigation and changing the display do not create files. Weeks start on Monday and use ISO week numbering. Today follows the workspace date timezone and shares the app’s red date marker.

Calendar offers Month and Heatmap appearances. The heatmap runs vertically with seven weekday columns and one week per row. Color measures the current plain-text word count, using language-aware segmentation, in four levels: 0–249, 250–499, 500–749, and 750+ words. Existing empty notes retain the first level; absent notes remain neutral. This measures note contents, including template text, rather than a history of typing activity. Word counts come from the rebuildable file index and are reused until that note’s revision changes.

Settings → Journal controls the folder, daily/weekly filename formats, and separate templates. Default files are `Journal/YYYY/MM/YYYY-MM-DD.md` and `Journal/Weekly/GGGG-[W]WW.md` (for example `Journal/Weekly/2026-W41.md`). Template dates use the chosen day, or Monday for a weekly note; time uses the creation time in the workspace timezone.

New journal notes record readable metadata alongside their normal card ID:

```yaml
journal:
  date: 2026-10-05
  period: daily
```

The date stays an all-day ISO string. Weekly notes store their Monday and `period: weekly`. This identity survives file renames and moves. Existing notes at the configured date path open without changes; they are recognized by that naming convention until given explicit journal metadata. Duplicate explicit journal identities are reported instead of selecting one silently. Existing files are never overwritten. Creation uses the normal recoverable transaction and undo/redo flow; the database can be deleted and rebuilt from Markdown.
