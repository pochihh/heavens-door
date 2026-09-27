# Menus and tooltips

This is the shared interaction contract for Heaven’s Door. It defines the target behavior; the implementation gaps below still need fixes. Apply it to Explorer menus, View tab menus, Tab Group actions, workspace switching, card/whiteboard actions, and future plugin menus.

## Terms and scope

- **Context menu:** actions for the item or View that was right-clicked, or invoked with Shift+F10 / the Menu key. Opening it does not activate an inactive View or execute an action.
- **Dropdown menu:** actions or choices opened by a button, such as the workspace switcher or Tab Group actions. It follows the same dismissal, focus, row styling, and tooltip rules as a context menu.
- **Popover:** a floating interactive surface containing inputs or richer content, such as the card-link picker. It shares Escape and outside-click dismissal, but retains normal form keyboard behavior.
- **Tooltip:** a short, non-interactive explanation associated with a hovered control. It is not a menu, notification, or replacement for a visible label.

An in-document disclosure, such as “Linked from,” is not a floating menu. Native operating-system menus retain their platform behavior. Menus and tooltips are transient window state; do not persist them in the Workspace layout.

## Opening and placement

Only one menu is open in a window. Opening another closes the previous menu and cancels any visible or pending tooltip. Right-clicking another target replaces the menu with that target’s actions. Clicking an already-open dropdown’s trigger closes it without reopening it from the same click.

A pointer-opened context menu starts at the right-click location. A dropdown aligns to its trigger, normally below it; the bottom workspace switcher opens above. A keyboard-opened context menu anchors to its triggering item. Flip the opening direction near an edge and keep at least 8 px inside the viewport. Long menus scroll within the viewport; they must not be clipped by a Dock or View.

Opening a menu never counts as hovering an item, even if the new menu appears beneath a stationary pointer. Pointer opening focuses the menu container without giving an item a hover appearance. Keyboard opening focuses the first enabled action, or the current choice in a selection menu. Neither opening method shows a tooltip.

## Closing and focus

| Event | Required behavior |
| --- | --- |
| Escape | Close the active menu or popover and its tooltip, even if focus has moved outside it. Consume Escape so the same keystroke does not also affect the underlying View. |
| Pointer-down anywhere outside | Close immediately, including clicks on another Dock, the canvas, another control, or empty space. Allow the outside target to receive the same click. |
| Right-click elsewhere | Close the old menu, then open the appropriate new context menu if the new target has one. |
| Click the dropdown trigger again | Close once; do not reopen during the same event sequence. |
| Choose an enabled action | Close the menu and tooltip, then run the action once. Show subsequent errors through the normal error UI. |
| Click a disabled action, separator, or unused space inside | Do not execute an action or dismiss the menu. |
| Tab / Shift+Tab in an action menu | Close and move focus forward/backward from the trigger; do not trap Tab inside the menu. |
| Window loses focus, viewport resizes, or the anchor disappears | Close and cancel pending tooltip timers. |
| Scroll outside the menu | Close so the menu cannot become detached from its target. Scrolling inside a long menu keeps it open. |

Escape returns focus to the trigger or context target when it still exists. Outside-click dismissal lets the clicked target receive focus; cleanup must not steal it back. If an action opens a dialog or focuses an editor, the new destination owns focus. Restoring focus must not open a tooltip.

Arrow Up/Down navigate enabled menu actions; Home/End select the first/last enabled action. Enter or Space invokes the focused action. Popover inputs keep their normal editing and Tab behavior. Keyboard focus has a visible indicator independent of pointer hover.

## Tooltip eligibility and timing

Tooltips appear **only after genuine pointer hover**, with the existing 450 ms delay. Clicking, right-clicking, opening a menu, keyboard focus, programmatic focus, and restoring focus do not show one. After a menu opens, require fresh pointer movement into or within an eligible control before starting the hover delay; a newly mounted element under a stationary pointer is insufficient.

Opening any menu immediately hides the current tooltip and cancels its timer. While the menu is open, only its eligible controls may show tooltips; underlying Views and the trigger are suppressed. Holding a pointer button, dragging, resizing, or opening another overlay suppresses tooltips too.

An action with a fully visible, descriptive label normally has **no tooltip**. Do not repeat “Refresh Explorer” in a tooltip over a row already named “Refresh Explorer.” Use a tooltip for a useful additional explanation, a disabled-action reason, or the full text of an actually truncated label. Icons without text need a concise tooltip and an accessible name. Display shortcuts in the menu row when available.

Leaving the control, pointer-down, context-menu invocation, scrolling, Escape, window blur, removal of the control, or closing/replacing its menu dismisses the tooltip and cancels its timer. A delayed tooltip must recheck that its owner is connected, still hovered, and belongs to the active surface before appearing. Closing a menu does not automatically restore its trigger’s tooltip; require fresh hover.

Hover-only tooltips must not be the sole source of essential instructions. Preserve accessible names and expose meaningful descriptions or disabled reasons to assistive technology independently of tooltip visibility.

## Tooltip placement and appearance

Anchor the tooltip to its owning control’s bounds, not to the right-click location or last pointer position. For menu rows, place it outside the menu, preferably beside the hovered row; flip to the other side if needed. Avoid covering the hovered row or neighboring actions. For ordinary controls, prefer below the control, then above. Keep a 7 px gap and at least 8 px viewport clearance. If neither side of a menu fits, place the tooltip above/below the menu, wrap long text, and keep it within the viewport.

Use one shared tooltip per window with `role="tooltip"`, an associated description, and no pointer interception. Use theme tokens, the shared small corner radius, and the existing compact typography. No arrow, bounce, scale effect, or animation that delays interaction is needed. Menu opening and dismissal are immediate; any hover/focus color transitions follow the shared motion tokens and reduced-motion preference.

Menu rows use the same padding, icon column, text alignment, checkmark placement, disabled appearance, separators, and focus treatment everywhere. Labels use established app terms, including **View**, **Tab Group**, **Main Dock**, **Side Dock**, and **Workspace**. Use one shared menu implementation rather than separate behavior for each View.

## Current implementation gaps

Reviewed against `src/renderer/Overlays.tsx`, `App.tsx`, `Editor.tsx`, and `WorkspaceMenu.tsx`:

| Area | Current behavior | Required correction |
| --- | --- | --- |
| Tooltip on menu opening | `ActionMenu` focuses the first item; tooltips now ignore focus events and retain the 450ms hover delay. | Still distinguish a newly mounted row under a stationary pointer from genuine movement. |
| Duplicate labels | Only an explicit additional `hint` supplies a menu tooltip. | Detect genuine truncation if full-label tooltips are needed later. |
| Tooltip position | The shared host places all tips below/above their owner. | Add menu-aware placement outside the menu. |
| Dismissal and focus | `ActionMenu` handles outside pointer-down in capture (including canvas drags), blur, resize, and Escape/Tab received inside the menu. Outside-click dismissal preserves the new focus target. Card triggers are exempt from outside dismissal so a second click toggles their menu. | Make Escape reliable for the open surface, define scrolling and Tab dismissal as above. |
| Alternate menus | Main Dock “Tab Group actions” and the card-link picker use independent `<details>` surfaces. | Bring their floating-surface dismissal under this contract. The link picker remains a form popover. |
| Menu lifecycle | Individual components own menu state; there is no shared rule enforcing one open menu or invalidating tooltip timers on menu opening. | Coordinate opening, replacement, closing, and tooltip ownership through the shared interaction layer. |

## Acceptance checks

1. Right-click a View and leave the pointer still for longer than 450 ms: one menu, no tooltip, no action executed.
2. Hover “Refresh Explorer”: its fully visible label is not repeated. Hover an item with an additional hint: show the hint after 450 ms, outside the menu.
3. Open a menu while a trigger tooltip is visible or pending: the tip disappears and never reappears from its old timer.
4. Escape closes the menu; an outside click closes it and activates/focuses the clicked target. Neither path produces a tooltip on focus restoration.
5. Click the same dropdown trigger twice, right-click a different View, and open another dropdown: each leaves the expected single menu or no menu.
6. Navigate by keyboard, including disabled items, Enter/Space, Tab/Shift+Tab, and Escape. No keyboard or programmatic focus event opens a tooltip.
7. Repeat with a menu near each viewport edge, in a narrow window, and with long labels. No menu is clipped and no tooltip covers the actionable rows.
8. Repeat in both themes and with reduced motion. Check Explorer, View tabs, Tab Group actions, workspace switching, and the card-link popover.
