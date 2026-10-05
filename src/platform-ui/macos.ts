/**
 * macOS の差分（ADR-0028 §3.3 / M10 §4.5・§4.6・§4.13）。
 * 起動時に macOS でだけ読み込む。
 *
 * キーの判定と表記・文言・信号機ボタンの余白・フォント・既定のコンテキストメニューの抑止を持つ。
 */
import './macos.css';

import { getLocale, setMessageRewrite, t } from '@/i18n';
import { runCommand, type CommandId } from '@/lib/commands';
import { bindKeys, canonicalKey, setKeyProfile } from '@/lib/shortcuts';

import { rewriter, suppressNativeContextMenu, type Rewrites } from './shared';

/**
 * macOS で付け足すキー（M10 §4.6）。
 * 元の割り当ては残し、OS に取られるものだけを [`BLOCKED`] で外す。
 *
 * `Ctrl` は `Cmd`、`Control` は物理の Control キーである（`combo`）。
 */
const ALIASES: readonly (readonly [key: string, id: CommandId])[] = [
  // 置換。
  // `Cmd+H` は OS の「隠す」であり、Monaco の macOS の既定と同じ `Cmd+Option+F` にする。
  ['Ctrl+Alt+F', 'find.replace'],
  // 戻る / 進む。
  // `Option+←` は単語単位の移動であり、ブラウザと同じ `Cmd+[` / `Cmd+]` にする。
  ['Ctrl+[', 'history.back'],
  ['Ctrl+]', 'history.forward'],
  // タブの切り替え。
  // `Cmd+Tab` は OS が取る。
  // 物理の `Control+Tab` と、Safari と同じ `Cmd+Shift+]` / `Cmd+Shift+[` にする。
  ['Control+Tab', 'tab.next'],
  ['Control+Shift+Tab', 'tab.previous'],
  ['Ctrl+Shift+]', 'tab.next'],
  ['Ctrl+Shift+[', 'tab.previous'],
];

/** OS に渡すキー。アプリのキーとして扱うと、OS の操作（隠す / 単語単位の移動）が効かなくなる。 */
const BLOCKED = new Set(['Ctrl+H', 'Alt+ArrowLeft', 'Alt+ArrowRight']);

/** 表示する割り当て。メニューとコマンドパレットの表記（`Ctrl+H` など）を macOS の割り当てに読み替える。 */
const DISPLAY: Readonly<Record<string, string>> = {
  'Ctrl+H': 'Ctrl+Alt+F',
  'Alt+←': 'Ctrl+[',
  'Alt+→': 'Ctrl+]',
  'Ctrl+Tab': 'Control+Tab',
  'Ctrl+Shift+Tab': 'Control+Shift+Tab',
};

/** 修飾子の字形と並び（Apple のヒューマンインターフェイスガイドラインの順）。 */
const MODIFIERS: readonly (readonly [name: string, glyph: string])[] = [
  ['Control', '⌃'],
  ['Alt', '⌥'],
  ['Shift', '⇧'],
  ['Ctrl', '⌘'],
];

/**
 * `Option` を押していると `event.key` が合成文字（`Option+F` は `ƒ`）になるため、物理キー（`event.code`）から決める（M10 §4.6）。
 * `Shift` を押した角括弧（`{` / `}`）は角括弧として扱う。
 */
const CODE_KEYS: Readonly<Record<string, string>> = {
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Backquote: '`',
  Semicolon: ';',
  Quote: "'",
};

function keyOf(event: KeyboardEvent): string {
  if (event.altKey) {
    const letter = /^(?:Key|Digit)(\w)$/.exec(event.code)?.[1];
    const key = letter ?? CODE_KEYS[event.code];
    if (key !== undefined) return canonicalKey(key);
  }
  if (event.key === '{') return '[';
  if (event.key === '}') return ']';
  return canonicalKey(event.key);
}

/** イベントを `Cmd+Shift+P` → `Ctrl+Shift+P` の形にする。OS に渡すキーは空文字を返す。 */
export function combo(event: KeyboardEvent): string {
  const key = keyOf(event);
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Control');
  if (event.metaKey) parts.push('Ctrl');
  if (event.shiftKey && key !== '=') parts.push('Shift');
  if (event.altKey) parts.push('Alt');
  parts.push(key);
  const result = parts.join('+');
  return BLOCKED.has(result) ? '' : result;
}

/** 表示用に `Ctrl+Shift+P` を `⇧` `⌘` `P` に分ける。 */
export function split(shortcut: string): string[] {
  const parts = (DISPLAY[shortcut] ?? shortcut).split('+');
  const key = parts.pop() ?? '';
  return [...MODIFIERS.filter(([name]) => parts.includes(name)).map(([, glyph]) => glyph), key];
}

/** OS で変わる語（M10 §4.13）。 */
const REWRITES: Readonly<Record<'ja' | 'en', Rewrites>> = {
  ja: [
    ['エクスプローラーで表示', 'Finder で表示'],
    ['タスクトレイに格納する', 'Dock に残す'],
    ['タスクトレイで起動する', 'バックグラウンドで起動する'],
    ['タスクトレイで動作し続けます', 'Dock で動作し続けます'],
    ['「Ctrl+←」「Ctrl+→」', '「⌥←」「⌥→」'],
  ],
  en: [
    ['Reveal in File Explorer', 'Reveal in Finder'],
    ['Keep Running in the Tray on Close', 'Keep Running in the Dock on Close'],
    ['Start in the Tray at Login', 'Start in the Background at Login'],
    ['in the system tray', 'in the Dock'],
    ['Ctrl+← and Ctrl+→', 'Option+← and Option+→'],
  ],
};

/** 起動時に 1 回だけ呼ぶ。文言の読み込み（`loadMessages`）の後に呼ぶこと。 */
export function install(): void {
  setKeyProfile({ combo, split });
  bindKeys(
    ALIASES.map(([key, id]) => ({
      key,
      run: () => {
        runCommand(id);
      },
    })),
  );
  const rewrite = rewriter(REWRITES[getLocale()]);
  rewrite(t);
  setMessageRewrite(rewrite);
  suppressNativeContextMenu();
}
