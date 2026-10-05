/**
 * グローバルキーバインド。
 *
 * 和音（`Ctrl+K V` 等）は扱わないので、1 イベント 1 判定で済む。
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
 * OS ごとのキーの判定と表記（ADR-0028 §3.3）。
 *
 * macOS の差分（`Cmd` を主修飾子にする・`Option` を含むキーを `code` で判定する・表記を `⌘` にする）は OS 別のチャンク（`platform-ui/macos.ts`）が登録する。
 * 登録が無ければ Windows と Linux の規則で判定する。
 */
export interface KeyProfile {
  combo(event: KeyboardEvent): string;
  split(shortcut: string): string[];
}

let profile: KeyProfile | undefined;

/** OS 別のチャンクが起動時に 1 回だけ呼ぶ。 */
export function setKeyProfile(next: KeyProfile): void {
  profile = next;
}

/**
 * イベントを `Ctrl+Shift+P` 形式に変換する。
 *
 * `metaKey` も Ctrl と同一視する。
 * macOS では OS 別のチャンクが `Cmd` だけを Ctrl とする判定に差し替える（`setKeyProfile`）。
 * ウィジェット内のキー（ファイルツリーの `F2` など / `features/workspace/lazy/tree-keys.ts`）も同じ表記で判定する。
 */
export function comboOf(event: KeyboardEvent): string {
  if (profile) return profile.combo(event);
  const key = canonicalKey(event.key);
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
  // `=` は Shift の有無で `+` になる。
  // 倍率の拡大はどちらでも動作させるため、Shift を修飾子として数えない（`Ctrl+=`）。
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
export function canonicalKey(key: string): string {
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
  return profile ? profile.split(shortcut) : shortcut.split('+');
}
