/**
 * 英語の UI 文言。キーの構成は `ja/core.ts` に合わせる。
 * 表記の規則は `design/conventions/02-ui-wording.md` の「英語」の節にある。
 */
import type { Messages } from '../types';

/** 対象（パスや名前）が分かっていれば `本文: 対象` の形にし、空なら本文だけを返す（`ja/core.ts` と同じ）。 */
function withSubject(message: string, subject: string): string {
  return subject === '' ? message : `${message}: ${subject}`;
}

function count(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

export const en = {
  app: {
    name: 'Marxdown',
  },

  welcome: {
    title: 'Marxdown',
    newFile: 'New File',
    openFile: 'Open File',
    openFolder: 'Open Folder',
    recent: 'Recent Files',
    noRecent: 'Nothing opened yet',
    dropHint: 'You can also drop a Markdown file here',
    cliHint: 'Open from a terminal:',
  },

  tree: {
    title: 'Explorer',
    loading: 'Loading…',
    empty: 'This folder is empty',
    noRoot: 'No folder is open',
    openFolder: 'Open Folder',
    openCurrentFolder: 'Open Folder of Current File',
    failed: 'Could not read the folder',
    noMatch: 'No files match the filter',
    toolbar: 'Explorer actions',
    toggleState: (label: string, on: boolean) => `${label}: ${on ? 'On' : 'Off'}`,
    markdownOnly: 'Show Markdown Files Only',
    markdownOnlyOverridden: 'Show Markdown Files Only: disabled while filtering by extension',
    extensions: 'Filter by Extension',
    extensionsInput: 'Extensions to show',
    extensionsPlaceholder: 'md, txt, png',
  },

  palette: {
    title: 'Command Palette',
    placeholder: 'Search commands',
    noMatch: 'No matching commands',
  },

  quickOpen: {
    title: 'Go to File',
    placeholder: 'Search files by name',
    noMatch: 'No matching files',
    empty: 'Open a file or folder to search the files in it',
    recent: 'Recent Files',
    truncated: (n: number) => `Too many files. Searching only the first ${count(n, 'file', 'files')}`,
  },

  tab: {
    list: 'Open files',
    next: 'Next Tab',
    previous: 'Previous Tab',
    closeCurrent: 'Close Tab',
    reopen: 'Reopen Closed Tab',
    close: (name: string) => `Close ${name}`,
    menu: (name: string) => `Actions for ${name}`,
  },

  titlebar: {
    menu: 'Menu',
    untitled: 'Untitled',
    minimize: 'Minimize',
    maximize: 'Maximize',
    restore: 'Restore Down',
    close: 'Close',
  },

  menu: {
    new: 'New File',
    open: 'Open File',
    openFolder: 'Open Folder',
    moveToNewWindow: 'Move to New Window',
    moveToMainWindow: 'Move to Main Window',
    save: 'Save',
    saveAs: 'Save As',
    export: 'Export',
    exportHtml: 'Export as HTML',
    exportPdf: 'Export as PDF',
    toEdit: 'Edit',
    toPreview: 'Back to Preview',
    toSplit: 'Show Side by Side',
    fromSplit: 'Stop Showing Side by Side',
    settings: 'Settings',
    recent: 'Recent Files',
    noRecent: 'Nothing opened yet',
    reload: 'Reload',
    toggleEol: 'Toggle Line Endings',
    cycleMode: 'Cycle View Mode',
    gotoLine: 'Go to Line',
    formatTable: 'Align Table Columns',
    toggleScrollSync: 'Toggle Scroll Sync',
    showOutline: 'Focus Outline',
    showExplorer: 'Focus Explorer',
    explorerNewFile: 'Explorer: New File',
    explorerNewFolder: 'Explorer: New Folder',
    explorerRefresh: 'Explorer: Refresh',
    explorerCollapseAll: 'Explorer: Collapse All',
    quickOpen: 'Go to File',
    zoom: 'Zoom',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    zoomReset: 'Reset Zoom to 100%',
    search: 'Find in Preview',
    find: 'Find',
    replace: 'Replace',
    quit: 'Quit',
    checkUpdate: 'Check for Updates',
  },

  pane: {
    resizeRight: 'Resize Outline',
    resizeLeft: 'Resize Explorer',
    showExplorer: 'Show Explorer',
    hideExplorer: 'Hide Explorer',
    showOutline: 'Show Outline',
    hideOutline: 'Hide Outline',
  },

  outline: {
    title: 'Outline',
    empty: 'No headings',
    emptyHint: 'Lines starting with # become headings',
    filtered: 'No headings at the levels shown',
    collapse: 'Collapse Outline',
    expand: 'Expand Outline',
    jump: 'Go to Heading',
    jumpPlaceholder: 'Search headings',
    jumpNoMatch: 'No matching headings',
  },

  history: {
    back: 'Back',
    forward: 'Forward',
  },

  window: {
    textUnavailable: 'Could not move this tab to another window. Save it and try again',
    failed: 'Could not open a new window',
    moveFailed: 'Could not move the tab',
  },

  open: {
    reloaded: 'Reloaded',
    reloadedExternal: 'Loaded changes made outside Marxdown',
    changedExternally: 'The file was changed outside Marxdown',
    reloadAction: 'Reload',
    ignoreAction: 'Ignore',
  },

  save: {
    failed: 'Could not save',
    conflict: 'Could not save. The file was changed outside Marxdown',
    overwrite: 'Overwrite',
    reloadInstead: 'Reload',
    dirtyLabel: 'Unsaved changes',
  },

  preview: {
    copy: 'Copy',
    copied: 'Copied',
    copyFailed: 'Could not copy',
    copyLabel: 'Copy code',
    imageOutOfScope: 'Not shown because the image is outside the open folder',
    imageMissing: 'Image not found',
    imageAllow: 'Show Images in This Folder',
    imageAllowHint: (dir: string) => `Allow images in ${dir} until you quit the app (subfolders are not included)`,
    imageAllowFailed: 'Could not allow the images',
  },

  search: {
    label: 'Find in Preview',
    placeholder: 'Find',
    previous: 'Previous Match',
    next: 'Next Match',
    close: 'Close Find',
    noMatch: 'No results',
    position: (index: number, total: number, truncated: boolean) =>
      `${index} of ${total.toLocaleString('en-US')}${truncated ? '+' : ''}`,
  },

  split: {
    resize: 'Resize Editor and Preview',
    ratio: (percent: number) => `Editor ${percent}%`,
    syncOn: 'Scroll Sync: On',
    syncOff: 'Scroll Sync: Off',
    toggleSync: 'Click to toggle scroll sync',
  },

  link: {
    confirmOpen: (path: string) => `Open ${path} with the default app?`,
    open: 'Open',
    reveal: 'Reveal in File Explorer',
    outOfScope: (path: string) => `Cannot open a file outside the open folder: ${path}`,
  },

  notice: {
    dismiss: 'Dismiss notification',
  },

  editor: {
    pasteImageUntitled: 'Save the document before pasting images',
    pasteImageFailed: 'Could not save the image',
  },

  settings: {
    broken: 'Could not read settings.json. Using the default settings',
    openFile: 'Open File',
  },

  themes: {
    open: 'Open themes Folder',
    unknown: 'Cannot apply the selected color theme because it was not found',
    rejected: 'Cannot apply the color theme because the { and } in its CSS do not match',
  },

  export: {
    done: (path: string) => `Exported: ${path}`,
    reveal: 'Reveal in File Explorer',
    failed: (reason: string) => `Could not export: ${reason}`,
    marpUnsupported: 'Marp slides cannot be exported',
  },

  status: {
    mode: { preview: 'Preview', edit: 'Edit', split: 'Split' },
    chars: (n: number) => count(n, 'character', 'characters'),
    readingTime: (minutes: number) => `${minutes} min read`,
    cursor: (line: number, column: number) => `Ln ${line}, Col ${column}`,
    readonly: 'Read-only',
    eolConvert: (next: string) => `Click to change line endings to ${next.toUpperCase()} (applied on save)`,
    encoding: {
      // eslint-disable-next-line unicorn/text-encoding-identifier-case -- 画面に出す通り名であって、識別子ではない
      utf8: 'UTF-8',
      'utf16-le': 'UTF-16 LE',
      'utf16-be': 'UTF-16 BE',
      'shift-jis': 'Shift_JIS',
      'euc-jp': 'EUC-JP',
    },
    encodingReinterpret: 'Click to reopen with a different encoding',
    reinterpreted: (name: string) => `Reopened as ${name}`,
    modeSwitch: 'Click to switch view mode',
    pathCopy: 'Click to copy the full path',
    pathCopied: 'Copied the full path',
    pathCopyFailed: 'Could not copy the full path',
    zoomSelect: 'Click to change zoom',
    parsedIn: (ms: number) => `Parse ${ms.toFixed(1)}ms`,
    paintedIn: (ms: number) => `Paint ${ms.toFixed(1)}ms`,
  },

  error: {
    'not-found': (path: string) => withSubject('File not found', path),
    removedFromRecent: ' (removed from Recent Files)',
    'permission-denied': (path: string) => withSubject('Access denied', path),
    'out-of-scope': (path: string) => withSubject('Cannot open a file outside the open folder', path),
    'too-large': (path: string) => withSubject('Cannot open because the file is too large', path),
    binary: (path: string) => withSubject('Cannot open because it is not a text file', path),
    conflict: 'The file was changed outside Marxdown',
    'already-exists': (path: string) => withSubject('A file or folder with the same name already exists', path),
    'invalid-argument': (path: string) => withSubject('This operation cannot be performed', path),
    'settings-broken': 'Cannot save settings because settings.json could not be read',
    io: (path: string) => withSubject('Could not read or write the file', path),
    unexpected: 'An unexpected error occurred',
    unknownArgs: (args: string[]) => `Ignored invalid arguments: ${args.join(', ')}`,
    renderFailed: 'Could not display this file. Press F5 to reload',
  },
} satisfies Messages;
