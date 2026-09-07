/**
 * コマンドレジストリ（06.roadmap/m2-editor.md §1.2）。
 *
 * 仕組みだけを持ち、どんなコマンドがあるかは知らない（`lib/` 共有層）。
 * 実体を並べた表は唯一の登録元 `app/commands.ts` にあり、呼ぶ側（`features/menu` / 将来のパレット）はこのモジュールを介すことで `app/` を import せずに済む。
 *
 * クリティカルパスに載るのは `id` と `run` の表だけである（§1.2 の制約）。
 * ラベル等は呼び出し側の遅延チャンクに置く。
 */

/**
 * 実行できる操作の全体。ここに無い id は呼べない（誤った id は型検査で検出される）。
 *
 * 名前は `<領域>.<動作>` の形にする。
 * 領域はディレクトリ名ではなくユーザーから見た区分であり、`preview.zoomIn` が `features/preview/zoom.ts` にあるのは実装上の結果に過ぎない。
 */
export type CommandId =
  | 'app.quit'
  | 'document.new'
  | 'document.open'
  | 'document.openPath'
  | 'document.reload'
  | 'document.save'
  | 'document.saveAs'
  | 'document.toggleEol'
  | 'find.open'
  | 'find.replace'
  | 'history.back'
  | 'history.forward'
  | 'outline.jump'
  | 'outline.show'
  | 'pane.toggleRight'
  | 'preview.zoomIn'
  | 'preview.zoomOut'
  | 'preview.zoomReset'
  | 'settings.open'
  | 'tab.close'
  | 'tab.next'
  | 'tab.previous'
  | 'tab.reopen'
  | 'tab.select'
  | 'view.cycleMode'
  | 'view.toggleScrollSync'
  | 'view.toggleSplit'
  | 'view.togglePreview';

/** コマンド 1 つ。登録は `registerCommands`、実行は `runCommand` を通す。 */
export interface Command {
  id: CommandId;
  /**
   * 実行する。
   *
   * 引数を読むのは対象を取るコマンドだけである（現在は `document.openPath` のみ）。
   * 一覧から特定の 1 件を開く操作を表すために必要になる。
   * 汎用の引数にしないのは、任意の値を渡せるようにするとコマンドがイベントバスと変わらなくなるためである。
   */
  run: (target?: string) => void;
  /**
   * 一覧（メニュー / 将来のパレット）に出すか。省略は「常に出す」。
   *
   * 押しても何も起きない項目を並べないという判断（Principle 3）をここに集約する。
   * メニューもパレットも、この 1 つを見れば同じ結論になる。
   *
   * 実行そのものは妨げない。`runCommand` はこの値を参照しない。
   * キーバインドは一覧に出ていなくても動作する（`F5` は文書が無くても既定動作を止める必要がある）。
   *
   * TODO: 一覧とキーで判定を揃えるかどうかは UX の決定であり、M3 のパレット（F-NAV-06）で決める。
   */
  isListed?: () => boolean;
}

const registry = new Map<CommandId, Command>();

/**
 * 登録する。返り値を呼ぶと解除される（`bindKeys` と同じ形）。
 *
 * 同じ id を二度登録した場合は、後から登録したほうで上書きされる。
 */
export function registerCommands(commands: Command[]): () => void {
  for (const command of commands) registry.set(command.id, command);

  return () => {
    for (const command of commands) {
      if (registry.get(command.id) === command) registry.delete(command.id);
    }
  };
}

/**
 * 実行する。登録が無ければ何もしない。
 *
 * `isListed` は参照しない（一覧に出ないコマンドもキーから呼べる）。
 * 何もしなかった場合も返り値は `undefined` のままで、呼び出し側（`bindKeys`）が `preventDefault()` する動作は変わらない
 * （`F5` を WebView へ渡さないという要件がこれに依存している）。
 */
export function runCommand(id: CommandId, target?: string): void {
  registry.get(id)?.run(target);
}

/** 登録されているか。キーの割り当て先が実在することを検証するために使う。 */
export function hasCommand(id: CommandId): boolean {
  return registry.has(id);
}

/** 一覧に出すか。登録が無ければ出さない。 */
export function isCommandListed(id: CommandId): boolean {
  const command = registry.get(id);
  if (!command) return false;
  return command.isListed?.() ?? true;
}

/** テスト用。登録済みのコマンドをすべて削除する（`resetShortcuts` と同じ）。 */
export function resetCommands(): void {
  registry.clear();
}
