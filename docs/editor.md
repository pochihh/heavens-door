# Card editor storage

Cards remain Markdown files. No editor database, block identifiers or proprietary document payload is required to recover their content. Editing ordinary Markdown may normalize its whitespace; opening it does not write changes.

Text color and highlighting use inline HTML:

```html
A <span style="color: #ca533f; background-color: #fff0ad">colored thought</span>.
```

By default, new images are copied to `_assets/` beside the note, with a readable name and a collision-resistant suffix. Insertion writes a relative HTML reference inside a readable layout wrapper:

```html
<div data-better-edit-image="filled" style="width: 100%; margin-left: auto; margin-right: auto">
  <img src="_assets/diagram-41a8fb2c.png" alt="Control diagram" style="width: 100%; height: auto">
</div>
```

Existing Markdown images remain Markdown until an image-specific change needs HTML attributes. Resizing stores width and keeps the original asset. Descriptions use `alt`; captions use readable paragraph text inside the HTML image wrapper. Imports accept PNG, JPEG, GIF, WebP, AVIF and SVG, up to 25 MB each. Undoing insertion or removing an image removes the note reference, retaining the asset for recovery and other references. No automatic asset deletion occurs.

General HTML blocks and inline fragments retain their source through unrelated edits. Use their Edit HTML button for source changes. The preview suppresses scripts, embedded browsing contexts, forms and remote resource loads; source is preserved. This is document markup support, not JavaScript execution. Unrecognized Markdown extensions such as wiki links, footnotes and math still use the existing protected preview.

Block dragging changes Markdown order and indentation. A list item includes its entire subtree; the title is reserved. Valid moves and source edits use the existing revision checks, save flow and undo history. Schema and frontmatter are unaffected.

There is no bulk migration. Existing files remain usable externally, and unknown HTML is preserved instead of converted into a limited rich-text schema. Test coverage includes nested item moves, color/image save-and-reopen, custom HTML retention, import path validation, and the existing blank-line and editor-lifecycle regressions.

## Better Edit migration

The Better Edit migration now includes standalone images, non-destructive crops, image rows and placeholders, contextual block editing, selection styling, configurable slash commands, and Unicode symbol/emoji insertion. These use the current editor and file-saving pipeline rather than importing Obsidian's CodeMirror integration. There is no bulk conversion of existing notes.

Row-to-row merging and exporting a crop as a new file were not supported by the reference plugin and remain outside this migration. Copying the visible crop is available. Obsidian-specific executable command IDs are replaced with the app's own supported commands. Math, wiki links and footnotes retain the existing protected rich preview; Source mode permits editing their Markdown.

## Contextual tools and source mode

Card pages and card popups offer **Source mode** in their More menu. It edits the Markdown body, including the title and raw HTML, through the same draft, revision checks and undo/save pipeline. Tag frontmatter remains managed by the property UI. A page remembers its source-mode choice with its workspace view preferences; popup state is local to that popup. Switching modes alone never writes a card.

The block grip opens Duplicate, Delete, Turn into, and move/indent actions. Option-click Add to insert above. Dragging a text selection moves all intersecting blocks together, retaining their order. List-item moves carry their descendants once, even when the selection includes child text. Moving horizontally while dragging selects the nesting depth; dropping into one's own descendants is rejected. Text selections expose bold, italic, strike, inline code, links, text color and highlighting. Block conversions are in the block menu.

Type `/` on a fresh paragraph to search commands with the shared bilingual fuzzy engine, use arrows to choose, Enter to insert, and Escape to dismiss. **Settings → Editor** controls command availability/order and Markdown/HTML templates. `{{cursor}}` marks the insertion point. Application commands can open workspace search or save a checkpoint. Symbols and emoji are available in the block menu, slash menu, or Ctrl+Shift+Space; these insert normal Unicode characters.

Whiteboard cards hide tags and expose an Open in popup button beside Collapse. Click bottom empty space to append or focus the final empty paragraph. Block grips share one fixed gutter at every list depth and have transparent buttons; whiteboard cards never show the Add button. Grips hide below 65% whiteboard zoom.

## Image controls and layouts

Images have a hover toolbar for alignment, caption, crop, replacement and More. Under 280 screen pixels, the toolbar shows More only. The selection ring follows the visible image or crop and excludes its caption. Clicking beside an image clears its selection. The resize pill sits inside its right edge; toolbar buttons are transparent on a shared readable surface. Captions edit directly below the image; hiding a caption retains its text. Replacement keeps width, alignment and caption, resetting the crop for the new image. Copy image produces PNG pixels of the visible crop, including transparent circular corners; Copy original image and Copy HTML are separate actions. Animated sources copy their first decoded frame.

Paste, file drop, Upload, and image placeholders all use the same local asset importer. Linking an HTTP(S) image downloads a local copy; linking a local path reuses the asset. Settings → Editor configures the attachment folder, whether it is beside each card or at the workspace root, default image width and alignment. Writes use relative paths and never overwrite existing assets. Missing imported Obsidian images can be resolved with **Find image file**: explicit relative paths take precedence, then workspace-relative paths, then exact filename matches. Multiple filename matches require a choice.

Drag images sideways onto another image to form a row. Drag within a row to reorder, between rows to transfer, or to a block boundary to extract. Row controls include gap, alignment, justification, wrapping, placeholders, copy HTML, duplicate and removal. The existing inline-CSS `data-better-edit-image` / `data-better-edit-image-row` formats remain the storage contract, including older one-wrapper crops. Crop geometry and Unicode symbol data are adapted from Better Edit; editor behavior uses the app's existing React/pointer controls.
