# Card editor storage

Cards remain Markdown files. No editor database, block identifiers or proprietary document payload is required to recover their content. Editing ordinary Markdown may normalize its whitespace; opening it does not write changes.

Text color and highlighting use inline HTML:

```html
A <span style="color: #ca533f; background-color: #fff0ad">colored thought</span>.
```

New images are copied to `_assets/` beside the note, with a readable name and a collision-resistant suffix. Insertion writes a relative HTML reference:

```html
<img src="_assets/diagram-41a8fb2c.png" alt="Control diagram" width="320">
```

Existing Markdown images remain Markdown until an image-specific change needs HTML attributes. Resizing stores width and keeps the original asset. Descriptions use `alt`; captions can be ordinary text below the image. Imports accept PNG, JPEG, GIF, WebP, AVIF and SVG, up to 25 MB each. Undoing insertion or removing an image removes the note reference, retaining the asset for recovery and other references. No automatic asset deletion occurs.

General HTML blocks and inline fragments retain their source through unrelated edits. Use their Edit HTML button for source changes. The preview suppresses scripts, embedded browsing contexts, forms and remote resource loads; source is preserved. This is document markup support, not JavaScript execution. Unrecognized Markdown extensions such as wiki links, footnotes and math still use the existing protected preview.

Block dragging changes Markdown order and indentation. A list item includes its entire subtree; the title is reserved. Valid moves and source edits use the existing revision checks, save flow and undo history. Schema and frontmatter are unaffected.

There is no bulk migration. Existing files remain usable externally, and unknown HTML is preserved instead of converted into a limited rich-text schema. Test coverage includes nested item moves, color/image save-and-reopen, custom HTML retention, import path validation, and the existing blank-line and editor-lifecycle regressions.

## Better Edit migration

The compatibility reference is the `obsidian-better-edit` plugin's image schema, controls, and documented feature list. Keep ordinary Markdown/HTML as the storage contract. The following table separates the current foundation from the remaining migration work.

| Area | Current support | Migration target |
| --- | --- | --- |
| Image insertion | Local paste, drop and file picker; relative HTML references | Placeholders with Upload and Link; configurable attachment destination and defaults |
| Single-image editing | Resize, alt text, original size, duplicate, remove | Left/center/right alignment, inline caption with hide/show, replacement preserving layout, rectangular and circular crop |
| Image controls | Compact image-anchored More menu; separate alt-text popup | Better Edit hover toolbar for alignment, caption, crop, replace and More; More-only below 220 px |
| Image copying | Decoded original pixels, including SVG rasterization | Copy image copies the visible crop as PNG; Copy original image and Copy HTML remain separate actions |
| Image rows | Existing HTML renders and is retained through other edits | Create rows by dragging images together; reorder, transfer and extract items; placeholders; justify, alignment, wrapping and gap controls |
| Paths | New files use relative paths; card moves and whiteboard renames update HTML references | Resolve imported Obsidian shortest/vault-relative paths before offering a migration; never guess between duplicate filenames |
| Block editing | Reorder blocks and individual list subtrees, indent/outdent, add blocks | Duplicate/delete/Turn into, insert above, and broader Markdown compatibility |
| Selection styling | Floating toolbar and HTML text/highlight colors | Complete inline strike/code/link controls; keep block conversion in the block menu |
| Slash commands | Add-block menu | Searchable slash menu, configurable templates/order, application commands replacing Obsidian-specific command IDs |
| Symbols | Existing document icon picker is separate | Editor insertion of real Unicode symbols/emoji with shared search and keyboard controls |

For the next image pass, reuse the plugin's non-destructive crop geometry and portable inline-CSS representation with adapters for the current editor. Preserve the original asset. A hidden caption retains its text. Image replacement keeps the caption and alignment; crop behavior must account for the new image's dimensions. Existing `data-better-edit-image` and `data-better-edit-image-row` source must remain intact unless the user changes that image/layout. Older one-wrapper crops and current nested crop wrappers both need coverage.

Image row dragging is a separate interaction from moving the entire HTML block. Reuse the app's pointer drag preview, insertion marker and cancellation behavior; do not introduce a second native drag system. Row-to-row merging was not supported by Better Edit and is not part of parity. Exporting a crop as a new file was also deferred there; copying its visible pixels is the first export path here.
