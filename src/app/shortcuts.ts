/**
 * グローバルキーバインド（03.ux-spec.md §5）。
 *
 * # 和音を持たない
 *
 * §5.2 の決定により `Ctrl+K V` のような和音は扱わない。したがってここに
 * 「第 1 打鍵を受けて待機する」状態機械は存在せず、1 イベント 1 判定で済む。
 * この単純さは Principle 3「Simple Means Low Cognitive Load」の実装でもある。
 *
 * # 編集中のキーを奪わない
 *
 * M2 で CodeMirror が入ると、ほとんどのキーはエディタのものになる。
 * 既定では入力可能な要素にフォーカスがあるとき発火しない。
 * `whenEditing: true` を明示したものだけが、そこを越える。
 *
 * # 既定動作を必ず止める
 *
 * `Ctrl+=` / `Ctrl+-` は WebView 自身のズームに、`Ctrl+F` は WebView の検索に
 * 割り当たっている。一致したバインドでは必ず `preventDefault()` する。
 * ここを忘れると、アプリの倍率と WebView の倍率が二重にかかる。
 */

export interface Binding {
  /**
   * `Ctrl+Shift+P` 形式。修飾子は **Ctrl → Shift → Alt** の順で書く。
   * 単キーは `F11` / `Escape` のようにそのまま書く。
   */
  key: string;
  /**
   * 実行する。`false` を返すと「自分は扱わなかった」とみなし、
   * 同じキーに登録された 1 つ前のバインドへ処理が渡る。
   */
  run: (event: KeyboardEvent) => boolean | void;
  /** 入力欄・エディタにフォーカスがあっても発火させるか。既定は false。 */
  whenEditing?: boolean;
}

const registry = new Map<string, Binding[]>();
let listening = false;

/**
 * バインドを登録する。返り値を呼ぶと解除される。
 *
 * 同じキーに複数登録された場合、**後から登録したものが先に試される**。
 * 遅延ロードされた機能（検索パネルなど）が、既存のバインドを一時的に
 * 上書きしてから元へ戻せるようにするため。
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
  // IME 変換中のキーはアプリのものではない。日本語入力では必ず通る経路。
  if (event.isComposing || event.keyCode === 229) return;

  const list = registry.get(comboOf(event));
  if (!list) return;

  const editing = isEditingContext(event.target);

  for (let i = list.length - 1; i >= 0; i--) {
    const binding = list[i];
    if (!binding) continue;
    if (editing && binding.whenEditing !== true) continue;
    if (binding.run(event) === false) continue;
    event.preventDefault();
    return;
  }
}

/**
 * イベントを `Ctrl+Shift+P` 形式に落とす。
 *
 * `metaKey` を Ctrl と同一視しているのは、Windows 第一優先のまま
 * macOS で最低限動かすため。macOS 固有の割り当ては M6 の担当。
 */
function comboOf(event: KeyboardEvent): string {
  const key = canonicalKey(event.key);
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
  // `=` は Shift の有無で `+` になる。倍率の拡大は両方で効いてほしいので
  // Shift を修飾子として数えない（03.ux-spec.md §5.3 の `Ctrl+=`）。
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
 * - テンキーと Shift 経由の `+` は `=` に寄せる（`Ctrl+=` の実体は「拡大」）
 */
function canonicalKey(key: string): string {
  if (key === '+') return '=';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

/**
 * 入力中かどうか。CodeMirror の編集面は `contenteditable` なのでここで捕まる。
 */
function isEditingContext(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

/** テスト用。登録済みバインドを全部落とす。 */
export function resetShortcuts(): void {
  registry.clear();
}
