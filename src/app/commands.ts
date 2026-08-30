/**
 * 「このアプリで何ができるか」の唯一の表（06.roadmap/m2-editor.md §1.2）。
 *
 * # ここに集めた理由
 *
 * 以前は同じ操作の一覧が 2 か所に、別々の形で存在していた。
 *
 * ```text
 * bootstrap.ts installShortcuts()   キー → 無名クロージャ
 * features/menu/items.ts buildMenu() id / label / shortcut / run
 * ```
 *
 * M2 で書式コマンドとモード切り替えが、M3 でコマンドパレット（F-NAV-06）が
 * 3 つ目の一覧として加わる。**コマンドが 15 個増えてから寄せるのは、いま寄せるより高い。**
 *
 * 寄せた結果、`features/menu` が 8 つの feature を名指しで import していたのが
 * `runCommand(id)` だけになった。feature 同士が互いの関数名を知らなくなり、
 * 「誰が誰を呼んでいるか」が**この 1 ファイルを読めば分かる**状態になっている。
 *
 * # 登録元が `app/` にある理由
 *
 * ここはアプリの組み立て役（composition root）で、各 feature を知っていてよい
 * 唯一の場所。逆に feature 側はコマンドの存在を知らないままでいられる
 * （`zoom.ts` は `zoomIn` を export するだけで、id を知らない）。
 *
 * # クリティカルパスに載っているもの
 *
 * 06.roadmap/m2-editor.md §1.2 の制約どおり、**`id → run` と `key → id` の 2 つの表だけ**。
 * ラベルは `features/menu/items.ts`（遅延チャンク）に置いてある。
 * 実体も、遅延チャンクのものは `open*Lazily` の形を維持している
 * （動的 import 一行だけのモジュールを経由するので、押されるまで何もロードされない）。
 */
import { openPath, openViaDialog, reloadCurrent } from '@/features/document/open';
import { documentStore } from '@/features/document/store.svelte';
import { canGoBack, canGoForward, goBack, goForward } from '@/features/history/navigate';
import { openJumpLazily } from '@/features/outline/open-jump';
import { showOutline } from '@/features/outline/show';
import { toggleRightPane } from '@/features/panes/panes';
import { openSearchLazily } from '@/features/preview/open-search';
import { zoomIn, zoomOut, zoomReset } from '@/features/preview/zoom';
import { openSettingsLazily } from '@/features/settings/open-settings';
import { togglePreview } from '@/features/view/mode';
import { viewStore } from '@/features/view/store.svelte';
import { registerCommands, runCommand, type Command, type CommandId } from '@/lib/commands';
import { toMessage } from '@/lib/error';
import { bindKeys } from '@/lib/shortcuts';
import { getPlatform } from '@/platform';

/** 文書を開いているか。**開いていないと意味を持たない**コマンドの一覧条件。 */
function hasDocument(): boolean {
  return documentStore.meta !== null;
}

/**
 * 実体の表。
 *
 * `isListed` は「一覧に出すか」であって「実行できるか」ではない
 * （`lib/commands.ts` の `Command` を参照）。キーは一覧に出ていなくても効く。
 */
const COMMANDS: Command[] = [
  { id: 'document.open', run: () => void openViaDialogSafely() },

  // 一覧（メニュー）には出さない。対象を指定して開く経路で、
  // 「最近開いたファイル」の 1 件ごとがこれを呼ぶ。
  //
  // 開けなかった場合の通知と履歴からの除去は `openPath` の担当。
  {
    id: 'document.openPath',
    run: (target) => {
      if (target !== undefined) void openPath(target);
    },
  },

  { id: 'document.reload', run: () => void reloadCurrent(), isListed: hasDocument },

  // 戻る / 進む（F-NAV-07）。**辿れるときにしか一覧に出さない。**
  { id: 'history.back', run: () => void goBack(), isListed: canGoBack },
  { id: 'history.forward', run: () => void goForward(), isListed: canGoForward },

  // ペインとビュー（03.ux-spec/06-panes.md §4）。**キーの意味が 2 系統に分かれている。**
  //   ペイン: `pane.toggleRight` は「ライトペインを開閉する」。中身が何であれ。
  //   ビュー: `outline.show` は「Outline を出してフォーカスする」。**閉じない。**
  //
  // 後者がトグルでないのは、「アウトラインを見たい」という意図に対して
  // 常に同じ結果を返すため。アウトラインを左ペインへ移しても意味が変わらない。
  { id: 'pane.toggleRight', run: () => toggleRightPane(), isListed: hasDocument },
  { id: 'outline.show', run: () => void showOutline() },

  // 見出しへジャンプ（03.ux-spec/04-keybindings.md §3「移動」）。中身は遅延チャンク。
  // **コマンドパレット（`Ctrl+Shift+P` / M3）ではない。** 見出し専用。
  { id: 'outline.jump', run: () => void openJumpLazily(), isListed: hasDocument },

  // 表示モードの切り替え（F-MODE-06 / 03.ux-spec/02-view-modes.md §2）。
  //
  // **`Ctrl+Shift+M`（順送り）と `Ctrl+\`（Split）はまだ登録しない。**
  // モードが 2 つしか無いあいだ、順送りはこのトグルと同じ操作になり、
  // Split は存在しない。押しても同じ / 何も起きないキーを先に置かない
  // （Principle 3）。どちらも Phase 5 で Split と一緒に入る。
  { id: 'view.togglePreview', run: () => void togglePreview(), isListed: hasDocument },

  // プレビュー内検索（F-VIEW-10）。**Preview を見ているときだけ。**
  // Edit ではエディタ側の検索（F-EDIT-05 / Phase 3）が受け持つので、
  // ここで本文を探しに行くと、見えていない面を検索することになる。
  {
    id: 'preview.search',
    run: () => {
      if (viewStore.mode === 'preview') void openSearchLazily();
    },
    isListed: () => hasDocument() && viewStore.mode === 'preview',
  },

  // 倍率は Preview 専用ではない。エディタの font-size にも `--mx-zoom` が乗っている
  // （`features/editor/theme.ts`）。id の接頭辞が `preview.` なのは
  // 実装の置き場所であって、効く範囲ではない。
  { id: 'preview.zoomIn', run: () => void zoomIn(), isListed: hasDocument },
  { id: 'preview.zoomOut', run: () => void zoomOut(), isListed: hasDocument },
  { id: 'preview.zoomReset', run: () => void zoomReset(), isListed: hasDocument },

  { id: 'settings.open', run: () => void openSettingsLazily() },

  // 終了（ADR-0007 論点 3）。**確実に終了できる導線を 3 つ**という決定のうち、
  // キーとハンバーガーメニューの 2 つがこのコマンドを共有する（残りはトレイメニュー）。
  //
  // 編集機能が入る M2 以降は、ここにダーティ状態の確認
  // （03.ux-spec/07-status-and-notifications.md §1）が挟まる。**挟む場所が 1 か所で済む。**
  { id: 'app.quit', run: () => void getPlatform().quitApp() },
];

interface KeyBinding {
  key: string;
  id: CommandId;
  /** 入力欄・エディタにフォーカスがあっても発火させるか。既定は false。 */
  whenEditing?: boolean;
}

/**
 * アプリの再読み込みに置き換えるキー（03.ux-spec/04-keybindings.md §3）。
 *
 * **WebView の再読み込みは 1 つのキーに割り当たっているのではない。**
 * `F5` / `Ctrl+R` が通常の再読み込み、`Ctrl+Shift+R` / `Ctrl+F5` / `Shift+F5` が
 * キャッシュを無視した再読み込みで、Chromium 系ではどれも効く。
 * 1 つでも取りこぼすと、そこだけ「開いているファイルが消える」経路が残る。
 *
 * **トレイ常駐でプロセスの寿命が延びるほど、1 回の誤爆の被害が重くなる**。
 * 意味の違い（キャッシュを使うかどうか）はアプリ側の再読み込みには無いので、
 * 全部同じ動作に倒す。
 */
const RELOAD_KEYS = ['F5', 'Ctrl+R', 'Ctrl+Shift+R', 'Ctrl+F5', 'Shift+F5'];

/**
 * キーと id の対応（03.ux-spec/04-keybindings.md §3）。
 *
 * ここに並ぶのは**アプリ全体で効くもの**だけ。プレビュー内検索の `F3` / `Escape`
 * のように、開いている間だけ効くキーは、その機能のモジュールが自分で `bindKeys` する。
 *
 * **この表がクリティカルパスに載ってよい唯一の形**（06.roadmap/m2-editor.md §1.2）。
 * Design Brief §3.8 のキーバインド設定は、この表を差し替える形で入る。
 */
export const KEY_BINDINGS: KeyBinding[] = [
  { key: 'Ctrl+O', id: 'document.open' },

  // 再読み込みのキーは**必ず飲み込む**。
  //
  // 素通しすると WebView がページごと再読み込みし、`initialization_script` に
  // 載っている**起動時の** bootstrap が再適用される。コマンドラインで指定した
  // ファイルが、その後に D&D やダイアログで開いたファイルを押しのけて戻ってくる。
  //
  // 何も開いていないときも同じ理由で飲み込む（`reloadCurrent` は何もしない）。
  // `whenEditing: true` なのは、検索欄にフォーカスがあるときも同じ事故が
  // 起きるため。「このキーは WebView に渡さない」が要件そのものになっている。
  ...RELOAD_KEYS.map((key) => ({ key, id: 'document.reload' as const, whenEditing: true })),

  // VS Code と同じ `Ctrl+,`（Familiar）。03.ux-spec/04-keybindings.md §3 の
  // 一覧には無く、**設定 UI と一緒に足したキー**である。
  // `whenEditing: true` なのは、設定パネルの入力欄にフォーカスがあるまま
  // もう一度押したときも「設定を開く」であってほしいため（開いていれば
  // フォーカスが戻るだけで、2 枚目は出ない）。
  { key: 'Ctrl+,', id: 'settings.open', whenEditing: true },

  // Preview ⇄ 直前の編集モード（03.ux-spec/02-view-modes.md §2 の「最も使うトグル」）。
  //
  // `whenEditing: true` が要る。**Edit モードではフォーカスが CodeMirror にある**ので、
  // 既定の「入力中は発火しない」に任せると、入った先から戻れなくなる。
  { key: 'Ctrl+Shift+V', id: 'view.togglePreview', whenEditing: true },

  { key: 'Ctrl+Alt+B', id: 'pane.toggleRight' },
  { key: 'Ctrl+Shift+U', id: 'outline.show' },
  { key: 'Ctrl+Shift+O', id: 'outline.jump' },

  // 戻る / 進む（F-NAV-07）。相対リンクで辿った先から帰ってくるための経路で、
  // **スクロール位置も一緒に戻る**（`features/history/navigate.ts`）。
  { key: 'Alt+ArrowLeft', id: 'history.back' },
  { key: 'Alt+ArrowRight', id: 'history.forward' },

  // 表示倍率（F-VIEW-11）。**`whenEditing: true` が要る。**
  //
  // Edit モードではフォーカスが CodeMirror にあり、既定の「入力中は発火しない」に
  // 任せるとここを素通りする。素通りした `Ctrl+=` / `Ctrl+-` は **WebView 自身の
  // ズーム**に当たるので、アプリの倍率と WebView の倍率が二重にかかる
  // （`lib/shortcuts.ts` の「既定動作を必ず止める」）。
  //
  // 倍率は「いまどの面を見ているか」ではなく「この人の見え方の好み」なので、
  // どこにフォーカスがあっても効くのが正しい（VS Code も同じ）。
  { key: 'Ctrl+=', id: 'preview.zoomIn', whenEditing: true },
  { key: 'Ctrl+-', id: 'preview.zoomOut', whenEditing: true },
  { key: 'Ctrl+0', id: 'preview.zoomReset', whenEditing: true },

  // 検索を**開く**キーだけがここにある。開いている間だけ効く F3 / Escape は、
  // 検索モジュール自身が登録して自分で外す。押されてもいない機能のキーが
  // グローバルに居座らないようにするため。
  { key: 'Ctrl+F', id: 'preview.search', whenEditing: true },

  // Marxdown を終了する（ADR-0007 論点 3 / 03.ux-spec/04-keybindings.md §3）。
  //
  // **トレイ常駐では `✕` が「格納」の意味になる**ため、「本当に終わらせたい」を
  // 表すキーが別に要る。`whenEditing: true` なのは、検索欄や設定パネルに
  // フォーカスがあるときに**終了できないほうが困る**ため。
  { key: 'Ctrl+Q', id: 'app.quit', whenEditing: true },
];

/**
 * コマンドだけを登録する。返り値を呼ぶと解除される。
 *
 * キーを割り当てない入口を分けてあるのは、**Storybook がここだけを呼ぶ**ため。
 * メニューは id しか持たないので、登録が無いと項目が 1 つも出ない。
 * かといって Storybook でグローバルキーまで有効にすると、`Ctrl+F` が
 * ブラウザの検索ではなくアプリの検索を開こうとして邪魔になる。
 */
export function registerAppCommands(): () => void {
  return registerCommands(COMMANDS);
}

/**
 * コマンドを登録し、キーを割り当てる。起動時に 1 回だけ呼ぶ。
 *
 * 返り値を呼ぶと両方とも解除される（テスト用）。
 */
export function installCommands(): () => void {
  const unregister = registerAppCommands();
  const unbind = bindKeys(
    KEY_BINDINGS.map((binding) => ({
      key: binding.key,
      run: () => {
        runCommand(binding.id);
      },
      ...(binding.whenEditing === true && { whenEditing: true }),
    })),
  );

  return () => {
    unbind();
    unregister();
  };
}

/**
 * ダイアログを開く（F-OPEN-07）。
 *
 * ダイアログ自体の失敗（プラットフォーム側の異常）は通知に出す。
 * 「取り消した」は失敗ではないので何も出さない。
 */
async function openViaDialogSafely(): Promise<void> {
  try {
    await openViaDialog();
  } catch (e) {
    documentStore.notice = { level: 'error', message: toMessage(e) };
  }
}
