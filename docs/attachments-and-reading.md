# Attachments, annotations and reading

Updated October 21, 2026. PDF attachments are the independent foundation; Read later remains a separate feature under development.

Adding a PDF to a whiteboard creates its Markdown wrapper and source link, without `#readlater`, a reading status, or an Inbox destination. PDF rendering, highlights/comments, bookmark saves and source relinking work with the Read later plugin disabled. Attachments use their selected board folder; an unplaced import defaults to Slipbox. Tags remain optional user metadata, with the normal tag picker.

Only an explicit import/capture through Read later enrolls an item: it adds `#readlater`, initializes that tag's status and uses the configured Read later folder. The shared import request carries `readLater: true` for those entry points; ordinary attachment requests omit it. Bookmark writes never enroll an attachment. Startup only converts legacy status metadata on items already tagged `#readlater`; it does not infer membership from a PDF source, a bookmark or a folder. Existing tags are preserved, and removing `#readlater` stays removed after reopening. Read later shortcuts apply only to explicitly tagged items while that plugin is enabled.

Assets share the existing links, tags, file operations and undo system. Ordinary cards remain directly editable without reading controls. Ordinary Markdown and local source files remain authoritative; the database only accelerates navigation and search. Older design notes below describe experiments as well as the current PDF foundation; they do not make Read later a requirement for attachments. Stable releases continue through the documented approval and release workflow.

## Try it

- Add a PDF directly from the whiteboard, File explorer or an external file drop. This does not enroll it in Read later.
- The separate experimental **System → Read later** entry imports PDF/HTML files or captures a webpage by URL. The folder defaults to Inbox and can be changed in **Settings → Core plugins → Read later**.
- Open a PDF to read continuous pages. Select text and choose **Highlight** or **Add note**. Search, page jump and zoom stay in the reader toolbar.
- In an ordinary card or captured article, select text and use **Annotate**. General notes are available through **Add note**. Source mode shows the complete portable file.
- Notes start collapsed with a one-line preview on the right. Expand one to edit, change its color, jump to its quote or delete it. A selected board card shows the same rail outside its geometry.
- Right-click an empty board area to add an image, plain text or a rectangle, rounded rectangle, ellipse or diamond. Double-click a text object to edit it. Use the Style dock for text/fill/stroke controls.
- Expand **RSS feeds** in the library to add a feed, set an initial import limit, refresh or import/export OPML. Removing a feed keeps its saved cards.
- Chrome setup is described in [extensions/chrome/README.md](../extensions/chrome/README.md). The unpacked extension must be loaded manually. Test and stable apps use separate ports and pairing keys.

The existing local UI test workspace now includes a **Reading review** board, a two-page PDF, article captures and annotation examples. Existing test notes were retained.

### Reader shortcuts

PDF text selection: **H** highlights and **N** adds a note. **Command/Ctrl+F** focuses PDF search. For an explicitly enrolled Read later item, with focus outside an editable field, **J** opens the next Inbox item, **Shift+J** returns to Inbox, **D** marks it done and **N** adds a general note. Change these in Keyboard shortcuts. Normal text editing keeps its normal typing behavior.

### Validation and limits

Automated checks cover portable annotations, editing/reopening, mention indexing, source moves/copies, Trash/restore, index rebuild, board-object transfers and edges, local-image path bounds, receiver authentication and the extension's offline queue. The packaged macOS Test app was checked for PDF rendering/search/highlight notes, local HTML import, URL capture, RSS deduplication and dark/light layouts.

Chrome installation and live extension popup interaction, Windows packaging and long-document performance still need manual testing. PDFs are limited to 50 MB and 5,000 pages; HTML captures to 10 MB. Failed image downloads are reported while retaining their URLs and the original snapshot. Local HTML images outside the selected document's folder are not copied. The original snapshot is retained as evidence; the extracted Markdown and copied images are the offline reading surface. Scripts never run in the reader.

The release remains **0.1.27**. A temporary Test build does not enter the stable update feed.

## Agreed behavior

- Reading material is an asset: a Markdown wrapper with source metadata. Ordinary cards are user-authored notes and keep their simple editor without annotation controls. It can be tagged, mentioned, searched, placed on a board or displayed as a reference.
- Support both highlights attached to selected text and general notes about a card. Store annotations in their owning Markdown card.
- Sticky notes sit on the right in page, popup and whiteboard views. They start collapsed with a one-line preview of the note text and expand when clicked.
- On a whiteboard, notes sit outside the card and do not increase its width or height. At narrow reader widths, notes expand from a compact right-side rail over the content.
- PDF cards show the first page on a board. Opening one shows a continuous vertical reader in the popup. The page view also stacks PDF pages vertically from the start.
- Notes are part of the owning card, rather than separate cards or graph nodes. A mention inside a sticky note creates a link from its owning card.
- Standalone images on a board reuse the editor's single-image controls, including crop, caption and copying the visible or original image. They do not support image rows.
- Read later starts with local webpage/PDF import, a Chrome extension connected to the open app, and local RSS. Hosted receiving-email, AI and special blocks remain later work.
- Inbox is the default Read later folder. Slipbox remains the destination for ordinary cards not placed on a board.

## PDF and webpage reading

### Import and ownership

New external PDFs, images (including paste, drop and URL imports), and webpage snapshots default to `_assets` beside their owning card or whiteboard. For example, a PDF dropped onto `Projects/Organizer` is copied to `Projects/Organizer/_assets` and its Markdown wrapper stores a relative source link. **Settings → Files and folders → Attachments** controls both the folder name/path and whether it is local to each document or relative to the workspace root. Existing image storage preferences also apply to PDFs. Changing the setting affects new imports only. A PDF already inside the workspace is linked in place, including during relinking; never copy it again or overwrite an existing asset.

For a webpage, keep its original HTML snapshot and source URL, and produce readable Markdown article content for the card. Download article images into local assets so the captured article works offline. Preserve the snapshot even when extraction is incomplete, and show an import result that lets the user inspect or retry it. Importing arbitrary HTML does not enable webpage scripts or remote resource loading in the app.

The wrapper remains editable: title, summary, tags, properties and general notes use existing card interactions. The source PDF is unchanged. PDF-to-Markdown conversion is a later optional operation.

### Reader layout

Use Readwise Reader as the reference for reading and keyboard workflows, with the app's existing compact menu and toolbar guideline. A page or popup has the card's title and metadata, a reading area, and the annotation rail on its right. PDF pages stack vertically with text selection and search. Page count, current page and zoom belong in compact reader controls. A page control scrolls to the requested page; it does not replace the continuous document with a single-page view.

Render nearby PDF pages lazily while reserving every page's dimensions. Loading a page or opening a note must not move the document underneath the reader. Preserve reading position when opening or closing the popup.

The first page is the board preview. Its appearance follows the card's existing color and placement controls. The full reader opens through the reusable card popup, with the usual same-tab and new-tab options.

## Highlights and sticky notes

### Recommended selection interaction

Selecting text in a reader opens a compact toolbar with **Highlight** and **Add note**. Selection alone does not write anything. Highlight creates an anchor without requiring note text; Add note creates the anchor and focuses an expanded sticky note on the right. Support the same operations through configurable keyboard shortcuts.

In an ordinary Markdown card, add an **Annotate** action to the existing selection toolbar. Keep ordinary text coloring and background highlighting as formatting operations. Creating an annotation must be an explicit action, so existing colored text does not become a sticky note automatically.

### Note behavior

A collapsed note previews its first line, with ellipsis when necessary. If a highlight has no note text, preview the selected quotation instead. Expanding shows the full note and quoted context. Clicking its quotation navigates to the highlighted passage. General card notes have no passage anchor and appear in the same right-side rail.

Notes support normal text formatting and card/board mentions. Editing, deleting and undoing annotations use the same save and revision checks as card editing. Opening, collapsing or hovering a note does not save card content or change board geometry.

Reuse the app's palette and theme colors for highlights. Keep annotation controls compact, keyboard accessible and consistent with existing menus. A highlight color and sticky-note appearance can later be themed without changing the anchor's meaning.

When multiple anchored notes occupy the same part of the page, stack them in the rail without overlap, keeping their connection to the source passage visible. An unresolved anchor stays available in the rail with its quotation and note intact; the app must not silently attach it to different text.

## Standalone whiteboard images and text shapes

These are board objects stored in the readable `.whiteboard` file. They are not automatically Markdown cards.

| Object | Proposed controls |
| --- | --- |
| Image or figure | Move, resize, non-destructive crop, caption, replace, copy visible image, copy original image |
| Text | In-place text editing, font size and text color; no surrounding shape |
| Text shape | Rectangle, rounded rectangle, ellipse or diamond; text, fill and stroke colors |

Reuse the existing image toolbar and resize affordance. Keep image captions with the object and preserve the original image file. Do not introduce image-row controls or row merging for standalone objects.

Reuse canvas navigation, multi-select, moving selections between boards, connectors, deletion, undo and style controls. Moving a selection must retain the relationships between cards, objects and edges. Resize and crop previews must not write intermediate geometry. Connector endpoints follow the displayed object boundary.

For a first pass at mind maps, users can arrange text shapes and connect them manually. Automatic tree layout, presentation animations and elaborate shape styling stay outside this pass. If conversion into a card is included, it must retain placement and connections; it is not needed to ship the initial object controls.

## Read later Inbox

### Library and reading state

Read later is an optional Core plugin with a configurable folder and an editable Markdown guide. Its System entry, starred/recent items and searchable table/compact library follow the existing special-folder behavior. The guide starts collapsed.

Recommended library fields are title, source type, captured date, reading state and tags. Start with **New**, **Reading** and **Done** states, plus search and filters. Only explicitly enrolled items receive the real `#readlater` tag and its namespaced status property. Ordinary PDF attachments receive neither automatically. A library row opens the normal reading-card popup.

Keep reading state and progress in the wrapper. Save progress on a pause or when leaving the reader rather than on every scroll pixel. Keyboard actions should cover opening the next item, returning to the library, searching, highlighting, adding a note and marking an item done. Reuse the app's command and shortcut settings.

### Chrome capture

Pair the extension to a chosen workspace and send captures directly to Heaven's Door. The initial capture UI offers the current page or selected text. Show success or an actionable error without creating an empty card on failure.

The app accepts captures through a receiver bound to loopback, with a pairing token and validated workspace IDs. It must not accept arbitrary filesystem paths supplied by a webpage. Capture occurs only when invoked by the user.

When the app is closed, queue captures locally in the extension and deliver them when the paired app opens. A queued capture retains its collected content and source URL. This scope does not require a Readwise account or a hosted service. Direct annotation while browsing the original website is a possible follow-up after capture and in-app annotations work.

### RSS

Subscriptions and saved entries are local files in the configured Inbox. Support OPML import/export, refresh while the app is open, and deduplication by feed-entry ID or source URL. Removing a subscription retains already saved cards.

Recommended first behavior: create cards from the title, link and content or summary supplied by each feed. Fetching the complete article is a separate import operation when the feed only provides a summary. Offer an initial import limit so adding a feed does not unexpectedly fill the Inbox with its entire archive.

RSS is independent of email delivery. An always-available receiving-email address needs an email provider or hosted service; it is deferred. Local reading, import and RSS remain usable without that service.

## Portable storage and recovery

### Example PDF wrapper

The field names below are implemented. The existing `card-id`, tags and card-color contract stays intact.

```markdown
---
card-id: stable-card-id
source:
  type: pdf
  file: _assets/paper.pdf
  url: https://example.org/paper
  captured: 2026-10-13T12:00:00-07:00
  sha256: source-file-checksum
reading:
  page: 3
tags: [research]
---
# Paper title

User-written summary.

## Annotations
<!-- heavens-door:annotations -->
<!-- annotation:a1 {"page":3,"rects":[[0.1,0.3,0.8,0.05]],"quote":"Selected text"} -->
[^a1]: A highlight note. [Related card](../Research/Controller.md)

<!-- card-note:n1 {} -->
[^n1]: A general note about the paper.
```

PDF anchors use page numbers and normalized rectangles, with quoted text and the source checksum available for verification. Webpage/text anchors also retain surrounding text. For Markdown article content, use readable inline HTML and a Markdown footnote:

```markdown
A <mark data-annotation="a1">selected passage</mark>[^a1].

## Annotations
[^a1]: My note about that passage.
```

Malformed annotation metadata opens as editable source with an error instead of hiding or rewriting the note. Fenced examples are ordinary code, and Windows line endings are supported.

The app displays that annotation footer in the right-side rail instead of duplicating it at the bottom of the visual reader. Source mode shows the complete Markdown. Other editors can recover the quotations, notes and source paths from the file even without the app's UI.

The annotation pass must extend the editor's current protected-footnote preview to support editable annotations and preserve their source when saving and reopening. Preserve unrelated footnotes, unknown metadata and HTML through ordinary edits. Empty highlights retain their anchors even when their footnote text is empty.

### File operations

- Renaming or moving a card rewrites its relative PDF, snapshot, image and mention paths through the existing checked transaction.
- Copying a card creates a new card ID. Annotation IDs need only be unique within their owning card.
- Deleting a card uses app Trash and restore. Removing an image or attachment reference retains the source asset, as image removal does today; asset cleanup remains explicit.
- External source changes retain unresolved annotations and their text. External card edits use the existing conflict and recoverable-draft behavior.
- Rebuilding the database must reconstruct reading metadata, annotations and links from local files. Imported files must remain readable after the database is deleted or the app is unavailable.

## Implementation stages

1. **Local readers:** PDF import/wrappers, continuous reading, first-page board previews and HTML/article capture. Verify attachment moves and recovery first.
2. **Annotations:** selection toolbar, highlights, general notes, the right-side rail, portable anchors, ordinary-card support and keyboard actions.
3. **Whiteboard objects:** standalone images, text shapes, shared styling, connectors and multi-selection transfers.
4. **Read later capture:** Inbox library and state, paired Chrome capture and its offline queue, then RSS.

Each stage should be usable in the temporary Test app before the next is built. Keep the stable version unchanged during iteration; a release bump and the regular update route follow the user's testing approval.

## Checks before a stage is ready to test

- Opening or navigating a reader does not rewrite source content.
- PDF page loading, annotation expansion and image selection do not resize or jump the surrounding card unexpectedly.
- Annotations survive editing, undo, reopen, Source mode and a database rebuild.
- Card moves, copies, board transfers, Trash and restore preserve source paths and mention relationships.
- Captured content remains readable offline; failed imports retain recoverable information.
- Capture input is bounded and validated, with no script execution or arbitrary workspace-path access.
- Wide and narrow layouts work in dark and light themes, with keyboard access to reader and note actions.

## Confirmed interaction choices

| Choice | Recommended default | Alternative |
| --- | --- | --- |
| What happens on text selection? | Show Highlight / Add note; write only when an action is chosen | Automatically highlight selected text |
| When are board sticky notes visible? | Show the collapsed right-side rail for the selected card; hide it when deselected | Keep collapsed note previews visible beside every card |
| Initial text shapes and styling | Text plus rectangle, rounded rectangle, ellipse and diamond; simple font size and text/fill/stroke colors | Start with fewer shapes, or add further styling immediately |

The recommended defaults above were approved for this pass. The Test app is ready for product feedback before a stable release.

## Cards and assets

A card is user-authored Markdown. An asset is externally imported content (PDF or webpage) identified by its `source` metadata. Sticky notes and passage annotations are available only on assets. Existing annotation footers in old ordinary cards are preserved for recovery in Source mode, without showing a note rail or adding new annotations.

Standalone board images live in the `.whiteboard` layout, with a local image path and the existing portable crop/caption HTML. They have no Markdown wrapper or card editor. Images and first-page PDF previews float directly on the board, without a card shell; PDF assets retain their Markdown source wrapper. Their selection outline, connectors and mention-link center follow their image/page dimensions, excluding PDF controls and comments. Clicking either a PDF or its comments still selects the same attachment. New annotations explicitly save the palette’s yellow (Ochre); choosing No color clears both the note fill and passage highlight.

Dragging an asset note to a board creates an ordinary Markdown card in that board’s folder, rebases relative links and images, and includes a link back to the source. The comment moves out of the asset. Its highlight retains the original ID, page anchors and color, and stores the new card’s stable ID; it no longer appears as a duplicate comment in the notes column. Clicking the highlight opens the linked card in a popup. The card’s Source link uses a relative Markdown path with an `#annotation=<id>` fragment to return to that exact passage. Renames preserve the fragment and card identity. General notes without a highlight are removed from the asset. The original source file stays intact. The new card inherits the note’s saved color; an uncolored note creates an uncolored card. The source edit, new card and board placement are one undoable, revision-checked operation.

Standalone image resize uses only its vertical image handle. The selection outline and connection anchors cover the image without its caption. Plain text objects likewise use their text bounds, with no card chrome or corner handle.

October 14 verification for the card/asset separation: 207 tests and lint/type checks pass. In the packaged macOS Test app, ordinary card typing, image growth beyond its original width (340 → 404), image movement with its edge, reopen persistence, and dragging a PDF asset note into a real Markdown card were verified. The exact renderer was also exercised in a browser for a moved 16:9 crop, cropped-image resizing and movement, circle crop, crop reset, and dark/light appearance. The final packaged crop-handle interaction was interrupted when the Mac locked; it remains a manual verification item. Test build: `0.1.27-test.13`; stable release: unchanged.


October 17 figure fix: standalone images accept external image-file drops, browser image drags and raw clipboard images directly on the canvas. The canvas controls also include an image picker. Drops use board coordinates at the pointer; paste uses the current viewport. Multiple images are added in one undo action. Import errors are visible, and already imported images survive a later failure. Card editors and caption fields retain their own paste behavior. Imports use the existing attachment service and portable single-image HTML; no Markdown card wrapper is created.

Old cropped figures could retain a frame wider than the image pixels remaining after the crop offset. Display/resize now scales that remaining crop to the placement width, removing the empty selection area without rewriting a board just by opening it.

Verification: all 210 tests, lint/types, build and Test app signing verification passed. Browser checks used the actual saved broken crop and shared whiteboard/image components: pointer move, side-handle resize (540 → 660), crop-region drag, 16:9 crop, and dark/light appearance passed. A real browser image drag and raw PNG clipboard paste produced loaded figures; the pasted figure was resized (340 → 420), cropped and moved. The preview bridge kept these checks in memory. The packaged Test app opened the existing workspace and displayed the recovered figure, but native pointer automation returned unavailable-window/stale-element errors, so Finder-to-app drag and native clipboard interactions remain manual verification items. Test build: `0.1.27-test.14`; stable release unchanged.

PDF source recovery preserves the Markdown wrapper, its identity, tags, bookmarks, comments and highlight links. A reader with a missing or unreadable source shows a recoverable state; the board directs the user to the popup. Popup and page views include source-file details and a Relink PDF source action. The native file picker reads one bounded PDF, validates its signature, stores a non-overwriting copy in the configured attachment folder, and updates the wrapper with revision checks. Cancellation leaves the source unchanged, and the wrapper change is undoable. Relinking the same bytes restores the existing anchors; different bytes leave old highlights unresolved instead of guessing new positions.
