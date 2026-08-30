/**
 * コマンドレジストリ（06.roadmap/m2-editor.md §1.2）。
 *
 * # 何のためにあるのか
 *
 * 「同じ操作の一覧」を持つ場所が増え続けるのを止めるため。
 * いまはキーバインドとハンバーガーメニューの 2 つで、M2 で書式コマンドと
 * モード切り替えが、M3 でコマンドパレット（F-NAV-06）が加わる。
 * 呼ぶ側が `id` しか知らない形にしておけば、**足す作業は登録側の 1 行**で終わる。
 *
 * # ここに置いてある理由
 *
 * 仕組みだけで、どんなコマンドがあるかを知らない。だから `lib/`（共有層）に置く。
 * 実体（`run`）を並べた表は `app/commands.ts` にあり、**唯一の登録元**である。
 * 呼ぶ側（`features/menu` / 将来のパレット）が `app/` を import せずに済むのは、
 * このモジュールが両者の間に立っているから。
 *
 * # クリティカルパスに載ってよいもの
 *
 * 06.roadmap/m2-editor.md §1.2 の制約により、**`id` と `run` の表だけ**。
 * ラベル・説明・並び順は、それを出す側（メニュー / パレット）の遅延チャンクに置く。
 * ここに `label` を持たせると、メニューを一度も開かない起動でも
 * 全コマンドの文言が `main` に載る。
 */

/**
 * 実行できる操作の全体。**ここに無い id は呼べない**（タイプミスが型で落ちる）。
 *
 * 名前は `<領域>.<動作>`。領域はディレクトリ名ではなく**ユーザーから見た区分**で、
 * `preview.zoomIn` が `features/preview/zoom.ts` に居るのは結果に過ぎない。
 */
export type CommandId =
  | 'app.quit'
  | 'document.open'
  | 'document.openPath'
  | 'document.reload'
  | 'document.save'
  | 'document.saveAs'
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
  | 'view.togglePreview';

export interface Command {
  id: CommandId;
  /**
   * 実行する。
   *
   * 引数を読むのは**対象を取るコマンド**だけ（いまは `document.openPath` のみ）。
   * 一覧から「この 1 件を開く」を表すために要る。ここを汎用の引数にしないのは、
   * 何でも渡せる口にすると、コマンドがイベントバスに化けるため。
   */
  run: (target?: string) => void;
  /**
   * 一覧（メニュー / 将来のパレット）に出すか。省略は「常に出す」。
   *
   * **押しても何も起きない項目を並べない**（Principle 3）判断をここに集約する。
   * メニューもパレットも、この 1 つを見れば同じ結論になる。
   *
   * **実行そのものは妨げない。** `runCommand` はこれを見ない。
   * キーバインドは一覧に出ていなくても効く（`F5` は文書が無くても飲み込む必要がある）。
   * 一覧とキーで判定を揃えるべきかは UX の決定であり、コマンドを 1 枚に寄せた
   * いま初めて論点として見えるようになった。M3 のパレット（F-NAV-06）で決める。
   */
  isListed?: () => boolean;
}

const registry = new Map<CommandId, Command>();

/**
 * 登録する。返り値を呼ぶと解除される（`bindKeys` と同じ形）。
 *
 * 同じ id を二度登録した場合は**後から登録したほうが勝つ**。
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
 * 実行する。登録が無ければ黙って何もしない。
 *
 * `isListed` は見ない（一覧に出ないコマンドもキーからは呼べる）。
 * 何もしなかった場合も返り値は `undefined` のままで、呼び出し側（`bindKeys`）が
 * `preventDefault()` するところは変わらない
 * （`F5` を WebView へ渡さない、という要件がこれに依存している）。
 */
export function runCommand(id: CommandId, target?: string): void {
  registry.get(id)?.run(target);
}

/** 登録されているか。キーの割り当て先が実在するかを見張るために要る。 */
export function hasCommand(id: CommandId): boolean {
  return registry.has(id);
}

/** 一覧に出すか。登録が無ければ出さない。 */
export function isCommandListed(id: CommandId): boolean {
  const command = registry.get(id);
  if (!command) return false;
  return command.isListed?.() ?? true;
}

/** テスト用。登録済みコマンドを全部落とす（`resetShortcuts` と同じ）。 */
export function resetCommands(): void {
  registry.clear();
}
