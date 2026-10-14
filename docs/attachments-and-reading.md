# Attachments, annotations and Read later

Design proposal for the next implementation pass. This pass implements the UI/editor fixes; the attachment reader and Inbox are not implemented yet.

## Decisions

- Read later starts locally: webpage/PDF import, a Chrome extension paired to the open app, and RSS.
- Each saved item is an ordinary Markdown card. It can have tags and their properties, be placed on a board, or be referenced by other cards.
- Support both selected-text highlights and general card notes. Store them in their owning card, never a separate annotation database or card.
- Show expandable sticky notes in a right-side annotation rail in card pages and popups. Start collapsed with a one-line preview of the note text; clicking expands the full note and its quoted context. On a whiteboard they sit to the right of the card, outside its content and sizing. At narrow widths, keep a compact right-side rail; expanding a note opens it from that rail over the content, never below the card.
- A note is not an independent graph node or mention target. Links written in it belong to the owning card.
- Inbox is the default Read later folder; Slipbox keeps its existing purpose. Read later is an optional core plugin with a configurable folder and editable Markdown guide.

## Whiteboard objects

Use one text object with a shape option: None, Rectangle, Rounded rectangle, Ellipse or Diamond. None is ordinary text without a box. Keep font size, text/fill/stroke color, and the existing connector labels/arrow styles. Add standalone local image/figure objects directly to the whiteboard. Reuse the note editor’s single-image controls: resize, non-destructive crop, caption, alignment where applicable, replacement, and copy visible/original image. Keep captions with their image and preserve existing asset/crop metadata. Do not offer image rows or row-merging for these whiteboard objects. These objects live in the readable `.whiteboard` layout and refer to local assets; they are not automatically cards.

Reuse multi-select, move, resize, nesting into boards, undo, and connector endpoints. Converting an object into a card should preserve its placement and connections. Do not start with automatic mind-map layout, animation presets or a separate diagramming format. The five shape choices and this styling scope remain a proposal for review.

## File format

The PDF remains a PDF. A Markdown wrapper owns title, tags, source metadata, annotations and user-written content:

```markdown
---
card-id: stable-card-id
source:
  type: pdf
  file: _assets/paper.pdf
  url: https://example.org/paper
  sha256: source-file-checksum
tags: [research]
---
# Paper title

User-written summary.

## Annotations
<!-- annotation:a1 {"page":3,"rects":[[0.1,0.3,0.8,0.05]],"quote":"Selected text"} -->
[^a1]: A highlight note. [Related card](../Research/Controller.md)

<!-- card-note:n1 -->
[^n1]: A general note about the paper.
```

For ordinary Markdown or clipped articles, wrap the selected text in `<mark data-annotation="a1">…</mark>[^a1]`, with the note stored in the same footer section. This combines human-readable HTML/Markdown with local anchor IDs. The footer remains editable and recoverable in other editors.

PDF rectangles use normalized page coordinates. Include page, quoted text and a source checksum; webpage/text anchors also retain surrounding text. When the source changes and an anchor cannot be resolved confidently, retain the note and mark its location as unresolved rather than attaching it to different text.

Keep the original HTML snapshot alongside the card and default to readable Markdown article content. Sanitize rendering; do not execute webpage scripts or silently strip the preserved source. Retain source URL and download/capture time. PDF-to-Markdown conversion is a later, optional import operation.

The attachment implementation must extend file-move/link rewriting to these source references. Moving a card must not break its PDF or snapshot. Copies get a new card ID; annotation IDs only need to be unique within that card. Deleting a card uses the existing app Trash and restore flow. Asset cleanup remains explicit.

## Local capture and RSS

The Chrome extension saves to Heaven's Door directly; Readwise Reader is the UI/keyboard reference, not an account requirement. The user chooses a workspace when pairing. Use a receiver bound to loopback, a pairing token, bounded input validation, and workspace IDs rather than accepting arbitrary filesystem paths. Capture runs only when invoked on the current page. If the app is closed, queue captures locally in the extension and deliver them when it opens.

RSS subscriptions and collected entries live in the configured Inbox. Fetch while the app is open, deduplicate using feed entry ID/source URL, and retain already saved cards if a feed is removed. Import/export subscription lists as OPML. A local app cannot create an always-on receiving email address by itself: newsletter delivery needs an email provider or a hosted service. Account/sync/background delivery can be considered for Pro later; local reading, import and RSS do not require that server.

## Reading interface

On a whiteboard, a PDF card shows its first page as a preview. Opening it shows the continuous reader in a popup.

In a card page or popup, expand the PDF into a continuous vertical document from the start. Stack its pages in order and navigate by vertical scrolling; do not require left/right page switching. Keep annotations in the right-side rail alongside their page or quoted text. General card notes also stay in that rail. Rendering can load nearby pages lazily for large PDFs while retaining stable page positions and continuous scrolling.

Inbox opens the existing searchable table/compact library. A row opens its reading card, with source link, reading state, tags and annotations. Keep the guide collapsed. Use the shared command/shortcut settings for navigation, highlight, annotate, mark read, and return to the library. Reading progress belongs in the Markdown card, and the database is only a rebuildable index.

Reference behavior: [Readwise content capture](https://docs.readwise.io/reader/docs/faqs/adding-new-content), [highlights and notes](https://docs.readwise.io/reader/docs/faqs/highlights-tags-notes), [RSS](https://docs.readwise.io/reader/docs/faqs/feed), and [email newsletters](https://docs.readwise.io/reader/docs/faqs/email-newsletters).
