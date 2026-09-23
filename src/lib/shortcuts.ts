/**
 * グローバルキーバインド（03.ux-spec/04-keybindings.md）。
 *
 * 和音（`Ctrl+K V` 等）は扱わない（§2）ので、1 イベント 1 判定で済む。
 * 「入力中かどうか」も見ない。
 * 境界は `app/commands.ts` の `KEY_BINDINGS`（アプリ操作、どこでも有効）と `features/editor/lazy/keymap.ts`（本文の編集、エディター内でのみ有効）のどちらに書いてあるかで決まり、両者は重ならない（`keymap.ts` が重複キーを外す）。
 *
 * `Ctrl+=` / `Ctrl+-` / `Ctrl+F` は WebView 自身の機能にも割り当たっているため、一致したバインドでは必ず `preventDefault()` して二重動作を防ぐ。
 */

/** キー 1 つに対する割り当て。登録は `bindKeys` を通す。 */
export interface Binding {
  /**
   * `Ctrl+Shift+P` 形式。修飾子は Ctrl、Shift、Alt の順で書く。
   * 単キーは `F11` / `Escape` のようにそのまま書く。
   */
  key: string;
  /**
   * 実行する。`false` を返すと処理しなかったものとみなし、同じキーに登録された 1 つ前のバインドへ処理を渡す。
   */
  run: (event: KeyboardEvent) => boolean | void;
}

const registry = new Map<string, Binding[]>();
let listening = false;

/**
 * バインドを登録する。返り値を呼ぶと解除される。
 *
 * 同じキーに複数登録された場合、後から登録したものが先に試される。
 * 遅延ロードされた機能（検索パネルなど）が、既存のバインドを一時的に上書きしてから元へ戻せるようにするためである。
 */
export function bindKeys(bindings: Binding[]): () => void {
  for (const binding of bindings) {
    const key = canonicalCombo(binding.key);
    const list = registry.get(key) ?? [];
    list.push(binding);
    registry.set(key, list);
  }
  install();

  return () => {
    for (const binding of bindings) {
      const key = canonicalCombo(binding.key);
      const list = registry.get(key);
      if (!list) continue;
      const index = list.indexOf(binding);
      if (index >= 0) list.splice(index, 1);
      if (list.length === 0) registry.delete(key);
    }
  };
}

function install(): void {
  if (listening) return;
  listening = true;
  globalThis.addEventListener('keydown', dispatch);
}

function dispatch(event: KeyboardEvent): void {
  // IME 変換中のキーはアプリのバインドとして扱わない。日本語入力では必ずこの経路を通る。
  if (event.isComposing) return;

  const list = registry.get(comboOf(event));
  if (!list) return;

  for (let i = list.length - 1; i >= 0; i--) {
    const binding = list[i];
    if (!binding) continue;
    if (binding.run(event) === false) continue;
    event.preventDefault();
    return;
  }
}

/**
 * イベントを `Ctrl+Shift+P` 形式に変換する。
 *
 * `metaKey` を Ctrl と同一視しているのは、Windows を第一優先としたまま macOS でも動作させるためである。
 * macOS 固有の割り当ては macOS ビルド（F-OS-07）で扱う。
 */
function comboOf(event: KeyboardEvent): string {
  const key = canonicalKey(event.key);
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
  // `=` は Shift の有無で `+` になる。
  // 倍率の拡大はどちらでも動作させるため、Shift を修飾子として数えない（03.ux-spec/04-keybindings.md §3 の `Ctrl+=`）。
  if (event.shiftKey && key !== '=') parts.push('Shift');
  if (event.altKey) parts.push('Alt');
  parts.push(key);
  return parts.join('+');
}

function canonicalCombo(combo: string): string {
  const parts = combo.split('+');
  const key = parts.pop() ?? '';
  return [...parts, canonicalKey(key)].join('+');
}

/**
 * キー名を正規化する。
 *
 * - 英字 1 文字は大文字に揃える（Shift の有無で `p` / `P` が変わるため）
 * - テンキーと Shift 経由の `+` は `=` に統一する（`Ctrl+=` の実体は拡大操作）
 */
function canonicalKey(key: string): string {
  if (key === '+') return '=';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

/** テスト用。登録済みのバインドをすべて削除する。 */
export function resetShortcuts(): void {
  registry.clear();
}

/**
 * 表示用に `Ctrl+Shift+P` をキーごとに分ける。
 *
 * メニューとコマンドパレットで表示を揃えるため、両方がここを通る（`+` の実キーは `=` に正規化済みなので安全に分割できる）。
 */
export function splitShortcutKeys(shortcut: string): string[] {
  return shortcut.split('+');
}
