# Keyboard Shortcuts

[日本語](keybindings.md) | English

The list of Marxdown shortcuts.
Anything not listed here can be run from <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> (Command Palette).

## File

| Keys | Action |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>N</kbd> | New File |
| <kbd>Ctrl</kbd>+<kbd>O</kbd> | Open File |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>O</kbd> | Open Folder |
| <kbd>Ctrl</kbd>+<kbd>S</kbd> | Save |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> | Save As |
| <kbd>F5</kbd> / <kbd>Ctrl</kbd>+<kbd>R</kbd> | Reopen with the latest content on disk |
| <kbd>Ctrl</kbd>+<kbd>W</kbd> | Close Tab |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd> | Reopen Closed Tab |
| <kbd>Ctrl</kbd>+<kbd>,</kbd> | Settings |
| <kbd>Ctrl</kbd>+<kbd>Q</kbd> | Quit Marxdown |

Closing the window with `✕` leaves Marxdown waiting in the system tray.
To quit completely, press <kbd>Ctrl</kbd>+<kbd>Q</kbd>.

## Navigation

| Keys | Action |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>P</kbd> | Find a file in the folder by name and open it |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> | Command Palette |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd> | Find a heading and go to it |
| <kbd>Ctrl</kbd>+<kbd>Tab</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Tab</kbd> | Next / previous tab |
| <kbd>Ctrl</kbd>+<kbd>1</kbd>–<kbd>9</kbd> | Nth tab |
| <kbd>Alt</kbd>+<kbd>←</kbd> / <kbd>Alt</kbd>+<kbd>→</kbd> | Go back / forward to the document before / after following a link |
| <kbd>Ctrl</kbd>+<kbd>G</kbd> | Go to a line (in Edit / Split) |
| <kbd>Shift</kbd>+click | Open a file list item or a relative link in another window |

## View

| Keys | Action |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> | Switch between Preview and Edit |
| <kbd>Ctrl</kbd>+<kbd>\</kbd> | Split (editor and preview side by side) |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> | Cycle through view modes |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> | Open / close the left pane |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>B</kbd> | Open / close the right pane |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd> | Show the Explorer (file list) |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>U</kbd> | Show the Outline |
| <kbd>Ctrl</kbd>+<kbd>=</kbd> / <kbd>Ctrl</kbd>+<kbd>-</kbd> / <kbd>Ctrl</kbd>+<kbd>0</kbd> | Zoom in / zoom out / reset zoom |

## Find

| Keys | Action |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>F</kbd> | Find. In Split, finds in the focused side (editor or preview) |
| <kbd>Ctrl</kbd>+<kbd>H</kbd> | Replace (in Edit / Split) |
| <kbd>F3</kbd> / <kbd>Shift</kbd>+<kbd>F3</kbd> | Next / previous match |

## Markdown formatting (editor)

| Keys | Action |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>B</kbd> | Bold |
| <kbd>Ctrl</kbd>+<kbd>I</kbd> | Italic |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> | Strikethrough |
| <kbd>Ctrl</kbd>+<kbd>`</kbd> | Inline code |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>`</kbd> | Code block |
| <kbd>Ctrl</kbd>+<kbd>K</kbd> | Insert a link (the selected text becomes the link text) |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>.</kbd> | Quote |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> | Bulleted list |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd> | Numbered list |
| <kbd>Ctrl</kbd>+<kbd>Enter</kbd> | Toggle a task list checkbox |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>1</kbd>–<kbd>6</kbd> | Set the heading level |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>0</kbd> | Remove the heading |
| <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> | Indent / outdent a list item. In a table, move to the next / previous cell |
| <kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>F</kbd> | Align the columns of the table at the cursor |

Formatting keys apply to the selection if there is one, or to the cursor position otherwise.
Pressing them where the same formatting is already applied removes it.

Other editing actions (undo, moving lines, multiple cursors, and so on) are the same as in VS Code.

## File list (when the Explorer has focus)

| Keys | Action |
| --- | --- |
| <kbd>Enter</kbd> | Open (expand / collapse a folder) |
| <kbd>F2</kbd> | Rename |
| <kbd>Delete</kbd> | Move to the Recycle Bin (with confirmation) |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>Ctrl</kbd>+<kbd>X</kbd> / <kbd>Ctrl</kbd>+<kbd>V</kbd> | Copy / cut / paste |
| <kbd>Escape</kbd> | Cancel cut / reduce the selection to one item |
| <kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> | Copy the absolute path |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> | Copy the path relative to the opened folder |
| <kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>R</kbd> | Reveal in File Explorer (Windows) |
| <kbd>Ctrl</kbd>+<kbd>A</kbd> | Select all items at the same level |
| <kbd>Shift</kbd>+<kbd>↑</kbd> / <kbd>Shift</kbd>+<kbd>↓</kbd> | Extend the selection |
| <kbd>Ctrl</kbd>+click / <kbd>Shift</kbd>+click | Add to the selection / select a range (when two or more items are selected) |
| <kbd>Shift</kbd>+<kbd>F10</kbd> / Menu key | Open the menu |
| Letter keys | Move to the next item starting with that letter |
