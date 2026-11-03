# UI cleanup review

2026-11-02. Use the approved [UI terminology](ui-terminology.md). The functional fixes below are in local **0.1.2718-test.37**; the icon and Menu bar sections remain proposals. The Context banner was subsequently approved at the page bottom; see [its implementation contract](interactions/notices.md).

Document Tabs update (Test.44): the actions dropdown now contains Search tabs and uses shared dismissal; the separate search button is removed. Runtime names follow the approved terminology throughout labels, tooltips, Settings and validation copy, with a source regression preventing the old names. The user approved Open in another split and Close split. See [UI terminology](ui-terminology.md#actions-and-split-wording).

## Functional fixes delivered

- Inactive view blocks no longer retain code-block chrome. Active/inactive split views have matching geometry. The horizontally scrollable results now reach a 16px inset from the page’s scrollable edges, refined from the earlier fixed 16px extension.
- Whiteboard explorer rows keep More and omit the creation plus button. File explorer behavior is unchanged.
- Collapsed cards and PDFs retain width resize handles; stored expanded height and auto-height are preserved.
- Whiteboard Document tools are Star and More. Creation actions moved into More. Child boards have Delete whiteboard; Home is protected. Card page/popup More includes Delete card, saves the latest draft first and uses the existing recoverable confirmation.
- Regular card More no longer includes Text-only child/sibling actions.
- Document Tabs search has compact icon/name rows and a full-path Tooltip.
- The editor block controls stay outside the text hit region at canvas zoom levels. Editable content uses the text cursor.
- Settings is a real modal Dialog. Background hit testing and focus are blocked; nested controls remain usable.

Validation: ESLint and TypeScript pass; all 431 tests pass. The disposable Electron UI check covers split-view geometry, actual collapsed resizing, cursor hit regions, modal isolation and deletion of a draft saved to Trash. The separate Electron Settings check passes including nested logo import, command sorting and persistence. Test.37 was launched in First Door and its version verified in Settings. These checks do not establish Windows/Linux appearance or repeat the 10,000-element performance acceptance test.

## Icon direction for discussion

Keep Lucide as the default. The current shared control uses 16px icons with stroke width 1.65; the document picker uses 20px. Preserve the approved rectangle-and-arrow popup icon. Review meaning and legibility before replacing artwork.

| Candidate | Proposed role | Tradeoff |
| --- | --- | --- |
| Lucide | Navigation, document actions, editor controls, ordinary status icons | Already integrated; keep one visual baseline. Its React icons support size, color and stroke adjustments. [Official documentation](https://lucide.dev/guide/react/). |
| Tabler outline | Compare a few missing or ambiguous symbols against Lucide | Another outline vocabulary; match optical weight and small-size legibility before adopting individual symbols. [Official documentation](https://docs.tabler.io/icons). |
| Phosphor | Explore alternate document/status silhouettes for comparison | A broader visual change needs deliberate approval; do not mix families at random. [Official source](https://github.com/phosphor-icons/core). |
| Custom | PDF identity, application-specific whiteboard concepts and geometric handles | Keep the set small, documented and subject to the same size/color/accessibility rules. |

First review targets:

1. `external` currently means several things: open in a new tab, navigate to a definition, open a website, extract from an image row. Separate meanings visually where users must predict a different destination. Keep popup distinct.
2. `sync` represents PDF reload, explorer refresh, graph reset and checkpoint-related actions. Different labels are essential; decide where distinct icons improve recognition.
3. `map` represents a whiteboard type and several navigation actions. Preserve the board identity; consider a different symbol for showing a result on its whiteboard.
4. `expand` represents both fit-to-view and fit-to-size. Those need distinguishable labels and potentially distinct icons.
5. `branch` represents History and edges. `text` and `format` intentionally share AlignLeft, but their surrounding controls need context.

The complete source inventory is [UI icon inventory](ui-icon-inventory.md). Document picker choices are not unused merely because there is no literal JSX call. Do not load another complete icon catalog at startup; import only approved symbols. Custom PDF badges, resize corners, shape previews, edge arrowheads and graph geometry are inventoried separately from action icons.

## Proposed Menu bar

This concerns the native Menu bar, not the Title toolbar. No Menu bar changes have shipped in this pass.

Current implementation: on macOS, the app menu has About, Check for updates and Quit. File has two window actions and Close window. Edit has Cut/Copy/Paste/Select all. View has Reload, Developer tools and Full screen. Window uses the platform menu. Help currently appears only outside macOS.

The following is the proposed ordered content. Separators divide the groups shown below; only supported commands are enabled. Existing actions should keep their command handlers, save behavior and undo behavior rather than gaining separate implementations.

| Menu | Ordered groups |
| --- | --- |
| Heaven’s Door (macOS) | About Heaven’s Door; Check for updates…; **Settings…** / Hide Heaven’s Door; Hide Others; Show All / Quit Heaven’s Door |
| File | **New → Card, Whiteboard, From template…**; Add attachment… / Open workspace…; Manage workspaces… / New window; New window for this workspace / **Save checkpoint** / Close document; Close window |
| Edit | **Undo; Redo** / Cut; Copy; Paste; Select all / Copy styles; Apply styles |
| View | Show/Hide Left sidebar; Show/Hide Right sidebar / **Views → Whiteboard explorer, File explorer, Starred & Recent, Tags, Search, Graph, Calendar, History, Style, Agent console** / Zoom in; Zoom out; Fit to view / Enter/Exit full screen / **Developer → Reload window, Developer tools** |
| Window | **Split right; Split below** / Next document; Previous document; Search Document Tabs… / Platform window controls and open-window list |
| Help | Search workspace…; Keyboard shortcuts / Release notes; Project documentation / **Copy diagnostic report** |

Placement and behavior:

- On Windows/Linux, Settings is at the end of File; About and Check for updates are in Help. Quit/Exit follows platform conventions.
- New card/whiteboard and Add attachment apply to the current whiteboard; disable creation when there is no suitable destination. Template commands follow the existing plugin availability.
- Open workspace uses the existing Workspace manager. Opening another window must say explicitly whether it reuses the current Workspace.
- Save checkpoint names the existing checkpoint action. The app still saves edits automatically; do not add a misleading Save/Save as flow.
- Undo/Redo must target the active editor or whiteboard session. Native text-field undo alone is insufficient. Copy/Apply styles are enabled only for a supported whiteboard selection.
- Views opens/focuses the chosen View using existing placement rules. Do not silently move a user’s existing View to the other sidebar.
- Zoom/Fit target the active whiteboard, graph or PDF where supported. They must not accidentally zoom the whole interface.
- Close document closes its Tab; Close window closes the window. Neither deletes a file. Existing flush/cancel safeguards apply.
- Copy diagnostic report is part of the proposed notice/report work and remains pending; no direct Send to agent action until integration exists.
- Keep destructive document actions in the Document tools’ More menu and object Context menus rather than adding another unqualified Delete to the Menu bar.

Discussion points: confirm this menu grouping; decide whether Graph/Calendar belong in the Views submenu alongside the other Views. New unsupported shortcuts should be assigned only after checking the existing keybinding map.

## Warning/error options for review

Three concrete layouts use the same save-conflict example: **Context banner**, **Floating notice**, **Notification sidebar**. They also support example states for a missing PDF and unavailable History. The preview demonstrates disclosure, a report and recovery details without changing Workspace files.

| Option | Placement and persistence | Cost |
| --- | --- | --- |
| Context banner | At the bottom of the affected View, fixed outside scrolling content (approved). A persistent issue history/Status bar retrieval remains separate work. | Uses some vertical space, but keeps cause and recovery together. |
| Floating notice | Bottom corner over the Main area; issue remains reachable from the Status bar. | Compact, but can cover whiteboard content and needs stacking rules. |
| Notification sidebar | A persistent issue surface alongside the active content. | Handles several issues well but competes with the existing sidebars. |

Approved: Context banner at the page bottom, fixed outside scrolling content. A Toast is appropriate only for brief confirmations. A persistent issue history/Status bar retrieval can be discussed separately. Keep the current confirmation Dialog for destructive operations. Do not turn every warning into a modal interruption.

Common report contract to agree before implementation: short summary, affected operation/document, actionable recovery, severity, stable error code, timestamp, app version and expandable technical details. Report generation should omit credentials and avoid including document bodies by default. Copy report and future Send to agent should use the same structured report. Sending remains an explicit user action.

## More menu audit

Source review covers the current menu builders; it does not claim every combination has received native visual testing.

| Context | Finding / result |
| --- | --- |
| Whiteboard Document tools | Creation moved to More; child-board deletion added. Home has no delete command. |
| Regular card on whiteboard | Text branching actions removed; existing open/style/collapse/resize/link and recoverable deletion remain contextual. |
| Text | Child/sibling creation and convert-to-card remain here. |
| Card page and popup | Delete card added with draft flush and recoverable confirmation. |
| PDF | Reader layout/source/collapse options remain PDF-specific; note actions stay with the note. |
| Explorer | File/board/system entry menus already select commands by entry type. Whiteboard creation stays in More. Owned-card display remains board-specific. |
| View block / result | Block and view configuration stay separate; result actions operate on the result, not the containing card. |
| Tags / properties | Definition/removal/inheritance/property actions remain scoped to the tag or field. |
| Graph | Relationship visibility/reset in graph options; node menu handles navigation. |
| Image | Crop/caption/replace/row/extract actions depend on image and row context. |
| Search / Document Tabs | Navigation, split/open and close actions target the chosen result or Tab. Compact search preserves existing Context menus. |

Remaining follow-up tied to approved designs: unify ambiguous icon meanings and implement the pending Menu bar design. The runtime terminology migration is complete in the Document Tabs actions pass, with a standard source regression. The approved bottom Context banner is implemented separately; see its contract. Do not rename saved settings or internal identifiers as part of that wording pass.
