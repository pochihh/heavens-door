import {systemPath,type SystemEntry} from './features';
import type {Preferences} from './shared';
const filenames={reading:'inbox.md',templates:'template.md',journal:'journal.md',slipbox:'slipbox.md',tags:'tags.md',trash:'trash.md'};
export const systemGuidePath=(id:SystemEntry,prefs?:Preferences)=>systemPath(id,prefs)+'/'+filenames[id];
export const isSystemGuide=(path:string,prefs?:Preferences)=>Object.keys(filenames).some(id=>systemGuidePath(id as SystemEntry,prefs)===path);
export const systemGuideBody:Record<SystemEntry,string>={
 reading:`# Inbox

Import a PDF or HTML file, capture a webpage, or add an RSS feed. Every saved item is an ordinary Markdown card with its original source stored in local assets.

Select text in the reader to Highlight or Add note. Sticky notes appear on the right, initially collapsed with a one-line preview. General notes use Add note without selecting text.

Source mode shows the entire wrapper, including source metadata and annotations. Images, snapshots and PDFs stay local. Use New, Reading and Done to manage reading progress.

The Chrome extension pairs to this workspace using the connection information in Inbox. It queues captures when the app is closed. RSS refreshes while the app is open; removing a feed retains saved cards.

This guide is editable.
`,
 templates:`# Templates

Templates are ordinary Markdown notes. Create one here, then use **New from template** in the top bar. Choose a filename and folder; the template is copied once into an independent note.

- \`{{title}}\` inserts the new filename without .md.
- \`{{date}}\` inserts today's date, or the selected journal date.
- \`{{date:MMMM D, YYYY}}\` formats that date. \`{{time:h:mm A}}\` inserts the creation time.
- \`{{input:project}}\` asks for Project once and reuses the answer wherever it appears.
- \`{{include:Templates/Review checklist.md}}\` copies another template's body. Includes can share inputs; their properties are not copied.

Optional input definitions belong in YAML frontmatter:

\`\`\`yaml
---
template:
  inputs:
    project:
      label: Project
      type: text
    mood:
      options: [Good, Okay, Low]
      default: Okay
---
\`\`\`

Input types are text, number, checkbox, date, choice, note, and tag. Use \`required: false\` to allow an empty answer. Note and tag inputs offer search. Quote placeholders in YAML values; number and checkbox inputs retain their types when used as a whole value.

The main template controls the new note's properties, images, HTML, and view blocks. Relative image links in included templates keep pointing to their original files. Missing includes and circular includes are reported before creation.

This guide is editable. It is not offered as a template.
`,
 journal:`# Journal

Click a day in Calendar to create or open its daily note. Click a week number for a weekly note. Browsing the calendar does not create notes.

In **Settings → Journal and Calendar**, choose the journal folder, daily and weekly filename formats, and separate templates. Templates may be any Markdown file. Template inputs are requested only when creating a note.

Template dates use the selected day, or Monday for a weekly note. Time uses the creation time in the workspace timezone. Existing journal notes open unchanged.

Journal notes have readable YAML metadata with their date and daily/weekly period. This keeps their identity after moving or renaming them. Each note stays a normal Markdown file.

This guide is editable; your journal notes are listed below.
`,
 slipbox:`# Slipbox

Slipbox stores cards that have not yet been placed on a whiteboard. Create a card here, find it with search, or open it in a popup to edit.

Drag a card onto a whiteboard to place it. Choose Move to move the source file into that board's folder, or Reference to retain its current location.

Choose the Slipbox folder in **Settings → Files and folders**. Cards remain ordinary Markdown files, accessible in the folder explorer and other apps.

This guide is editable; it is kept separate from the card list.
`,
 tags:`# Tags

Create tags and open their pages to manage properties, default values, optional properties, colors, and views. Tag definitions are readable .tag files. Values on cards are stored in their Markdown YAML frontmatter.

Adding an optional property is explicit. Existing cards show only the properties stored in their files. Properties can be moved between Default and Optional on a tag page.

Choose the tags folder in **Settings → Tags**. Disabling Tags hides its UI while retaining your files.

This guide is editable; your tags are listed below.
`,
 trash:`# Trash

Deleted files and folders are kept here for recovery. Use Restore on an item below to return it to its previous location. If that name is occupied, restoration uses an available name and preserves the existing file.

Choose the Trash folder in **Settings → Files and folders**. Recovery information is stored alongside the archived files.

This guide is editable and is not itself a trashed item.
`
};
