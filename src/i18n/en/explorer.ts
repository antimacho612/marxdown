/** ファイルツリーのファイル操作だけが使う英語の文言。キーの構成は `ja/explorer.ts` に合わせる。 */
import type { ExplorerMessages } from '../types';

function items(n: number): string {
  return n === 1 ? '1 item' : `${n.toLocaleString('en-US')} items`;
}

function subject(names: string[]): string {
  return names.length === 1 ? `"${names[0] ?? ''}"` : items(names.length);
}

export const enExplorer = {
  newFile: 'New File',
  newFolder: 'New Folder',
  refresh: 'Refresh',
  collapseAll: 'Collapse All',
  nameInput: 'Name',
  keepTab: 'Keep Open',
  nameProblem: {
    empty: 'Enter a name',
    chars: 'The name contains characters that cannot be used (\\ / : * ? " < > |)',
    reserved: 'This name cannot be used on Windows',
    trailing: 'A name cannot end with . or a space',
    dots: 'This name cannot be used',
    tooLong: 'The name is too long',
    exists: 'A file or folder with the same name already exists',
  },
  menu: {
    label: (name: string) => `Actions for ${name}`,
    open: 'Open',
    openSatellite: 'Open in New Window',
    newFile: 'New File…',
    newFolder: 'New Folder…',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    copyPath: 'Copy Path',
    copyRelativePath: 'Copy Relative Path',
    copyLink: 'Copy as Markdown Link',
    copyTree: 'Copy Directory Tree',
    reveal: 'Reveal in File Explorer',
    rename: 'Rename…',
    delete: 'Delete',
  },
  confirmTrash: (names: string[], dirty: boolean) =>
    `Move ${subject(names)} to the Recycle Bin?` +
    (dirty ? '\nSome of the tabs have unsaved changes. The tabs stay open.' : ''),
  confirmTrashButton: 'Move to Recycle Bin',
  confirmMove: (names: string[], dest: string) => `Move ${subject(names)} to "${dest}"?`,
  confirmMoveButton: 'Move',
  trashed: (n: number) => `Moved ${items(n)} to the Recycle Bin`,
  copied: (n: number) => `Duplicated ${items(n)}`,
  moved: (n: number) => `Moved ${items(n)}`,
  hiddenCreated: (name: string) => `Created "${name}". Items whose names start with . are not shown in the Explorer`,
  linkCopied: 'Copied the Markdown link',
  treeCopied: 'Copied the directory tree',
  treeCopiedPartial: 'Copied the directory tree (only part of it, because it is large)',
  treeCopyFailed: 'Could not copy the directory tree',
  operationFailed: (detail: string) => `The file operation failed: ${detail}`,
} satisfies ExplorerMessages;
