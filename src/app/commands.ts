/**
 * 「このアプリで何ができるか」の唯一の表（06.roadmap/m2-editor.md §1.2）。
 *
 * 以前はキーバインドとメニューに別々の一覧が存在していた。
 * ここへ集約した結果、`features/menu` は `runCommand(id)` だけを呼べばよくなり、feature 同士が互いの関数名を知らずに済む。
 * 登録元がここ（`app/`）にあるのは、各 feature を把握してよい composition root だからである。
 *
 * クリティカルパスに載るのは `id → run` と `key → id` の 2 表のみである（§1.2 の制約）。
 * ラベルは遅延チャンク側（`features/menu/items.ts`）に置いてある。
 */
import { toggleEol } from '@/features/document/eol';
import { newDocument } from '@/features/document/new';
import { openPath, openViaDialog, reloadCurrent } from '@/features/document/open';
import { saveAsSafely, saveSafely } from '@/features/document/save';
import { documentStore } from '@/features/document/store.svelte';
import { canGoBack, canGoForward, goBack, goForward } from '@/features/history';
import { cycleMode, openFind, openReplace, togglePreview, toggleSplit } from '@/features/mode';
import { openJumpLazily, showOutline } from '@/features/outline';
import { toggleRightPane } from '@/features/panes';
import { zoomIn, zoomOut, zoomReset } from '@/features/preview/zoom';
import { openSettingsLazily } from '@/features/settings';
import { viewStore } from '@/features/view';
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
  // 新規ファイル（`Ctrl+N` / 03.ux-spec/04-keybindings.md §3）。**何も開いていなくても押せる。**
  { id: 'document.new', run: () => void newDocument() },

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

  // 保存（F-EDIT-02）。**ダーティでなくても押せる。**
  // 「押したのに何も起きない」を避けるためで、内容が同じならディスクは変わらない。
  { id: 'document.save', run: () => void saveSafely(), isListed: hasDocument },
  { id: 'document.saveAs', run: () => void saveAsSafely(), isListed: hasDocument },

  // 改行コードの変換（F-EDIT-14 / 03.ux-spec/07-status-and-notifications.md §3）。
  // 実体はステータスバーの `LF` / `CRLF` で、ここはコマンドとしての入口。
  // **キーは割り当てない。** 押す頻度が低く、覚えるキーを増やす価値が無い。
  { id: 'document.toggleEol', run: () => toggleEol(), isListed: hasDocument },

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

  // 表示モードの切り替え（F-MODE-03, 06 / 03.ux-spec/02-view-modes.md §2）。
  //
  // `Ctrl+Shift+V` は「Preview ⇄ 直前の編集モード」、`Ctrl+\` は Split のトグル、
  // `Ctrl+Shift+M` は順送り。**3 つとも意味が違う**ので別のコマンドにしてある。
  { id: 'view.togglePreview', run: () => void togglePreview(), isListed: hasDocument },
  { id: 'view.toggleSplit', run: () => void toggleSplit(), isListed: hasDocument },
  // 順送りは**一覧に出さない。** キーを知っている人のためのもので、
  // メニューには行き先の分かるトグル 2 つが既に並んでいる。
  { id: 'view.cycleMode', run: () => void cycleMode() },

  // スクロール同期（F-MODE-05 / 03.ux-spec/03-split-mode.md §2）。**Split のときだけ意味を持つ。**
  // 実体はステータスバーの `⇄` で、ここはコマンドとしての入口。
  {
    id: 'view.toggleScrollSync',
    run: () => (viewStore.scrollSync = !viewStore.scrollSync),
    isListed: () => viewStore.mode === 'split',
  },

  // 検索と置換（F-VIEW-10 / F-EDIT-05）。**id が `preview.` でも `editor.` でもない**のは、
  // 見ている面によって実体が変わるため。振り分けは `features/mode/find.ts`。
  //
  // 置換は Edit だけ。読んでいる面を書き換える経路は無い。
  { id: 'find.open', run: () => void openFind(), isListed: hasDocument },
  {
    id: 'find.replace',
    run: () => void openReplace(),
    isListed: () => hasDocument() && viewStore.mode !== 'preview',
  },

  // 倍率は Preview 専用ではない。エディターの font-size にも `--mx-zoom` が乗っている
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
 * アプリ全体で効くものだけを並べる（プレビュー内検索の `F3`/`Escape` のように開いている間だけ効くキーは、その機能のモジュールが自分で `bindKeys` する）。
 * クリティカルパスに載ってよい唯一の形であり（06.roadmap/m2-editor.md §1.2）、キーバインド設定はこの表を差し替える形で入る。
 *
 * ここに書いたキーはどこにフォーカスがあっても効く。
 * 以前は Edit モードで `whenEditing: true` を個別に足していたが、境界を「入力中かどうか」ではなく「どちらの表に書いてあるか」に変えたことで例外が無くなった。
 * この表と `features/editor/keymap.ts`（本文編集用）は重ならないよう、`keymap.ts` 側が重複キーを外している。
 */
export const KEY_BINDINGS: KeyBinding[] = [
  // 新規ファイル（03.ux-spec/04-keybindings.md §3）。素通りさせると WebView 自身の
  // 「新しいウィンドウ」に当たる（`Ctrl+O` や `Ctrl+S` と同じ理由で必ず飲み込む）。
  { key: 'Ctrl+N', id: 'document.new' },
  { key: 'Ctrl+O', id: 'document.open' },

  // 保存（F-EDIT-02）。素通りさせると WebView 自身の「名前を付けて保存」が開き、
  // **アプリの本文と無関係な HTML が保存される**。
  { key: 'Ctrl+S', id: 'document.save' },
  { key: 'Ctrl+Shift+S', id: 'document.saveAs' },

  // 再読み込みのキーは**必ず飲み込む**。
  //
  // 素通しすると WebView がページごと再読み込みし、`initialization_script` に
  // 載っている**起動時の** bootstrap が再適用される。コマンドラインで指定した
  // ファイルが、その後に D&D やダイアログで開いたファイルを押しのけて戻ってくる。
  //
  // 何も開いていないときも同じ理由で飲み込む（`reloadCurrent` は何もしない）。
  ...RELOAD_KEYS.map((key) => ({ key, id: 'document.reload' as const })),

  // VS Code と同じ `Ctrl+,`（Familiar）。03.ux-spec/04-keybindings.md §3 の
  // 一覧には無く、**設定 UI と一緒に足したキー**である。
  { key: 'Ctrl+,', id: 'settings.open' },

  // Preview ⇄ 直前の編集モード（03.ux-spec/02-view-modes.md §2 の「最も使うトグル」）。
  { key: 'Ctrl+Shift+V', id: 'view.togglePreview' },

  // Split（F-MODE-03 / 03.ux-spec/02-view-modes.md §2）。`Ctrl+\` は VS Code の
  // 「エディターを分割」に対応する（Familiar）。`Ctrl+Shift+M` は 4 モードの順送りで、
  // **`keymap.ts` が `vscodeKeymap` の同じキーを外してある**（Phase 3）。
  { key: 'Ctrl+\\', id: 'view.toggleSplit' },
  { key: 'Ctrl+Shift+M', id: 'view.cycleMode' },

  { key: 'Ctrl+Alt+B', id: 'pane.toggleRight' },
  { key: 'Ctrl+Shift+U', id: 'outline.show' },
  { key: 'Ctrl+Shift+O', id: 'outline.jump' },

  // 戻る / 進む（F-NAV-07）。相対リンクで辿った先から帰ってくるための経路で、
  // **スクロール位置も一緒に戻る**（`features/history/navigate.ts`）。
  //
  // Windows のエディターでは `Alt+←` は空いている（`vscodeKeymap` が
  // `Mod-ArrowLeft` に単語移動を置いていて、`Alt` 側は mac だけ）。
  { key: 'Alt+ArrowLeft', id: 'history.back' },
  { key: 'Alt+ArrowRight', id: 'history.forward' },

  // 表示倍率（F-VIEW-11）。素通りした `Ctrl+=` / `Ctrl+-` は **WebView 自身の
  // ズーム**に当たるので、アプリの倍率と二重にかかる
  // （`lib/shortcuts.ts` の「既定動作を必ず止める」）。
  //
  // 倍率は「いまどの面を見ているか」ではなく「この人の見え方の好み」なので、
  // どこにフォーカスがあっても効くのが正しい（VS Code も同じ）。
  { key: 'Ctrl+=', id: 'preview.zoomIn' },
  { key: 'Ctrl+-', id: 'preview.zoomOut' },
  { key: 'Ctrl+0', id: 'preview.zoomReset' },

  // 検索・置換（F-VIEW-10 / F-EDIT-05）。**開くキーだけがここにある。**
  // 開いている間だけ効く `F3` / `Escape` は、Preview では検索モジュールが
  // 自分で登録して自分で外し、Edit では `keymap.ts` が scope 付きで持っている。
  //
  // `Ctrl+F` は WebView 自身の検索にも割り当たっているので、飲み込むこと自体に
  // 意味がある。`Ctrl+H` が Preview で何もしないのに登録してあるのも同じ理由。
  { key: 'Ctrl+F', id: 'find.open' },
  { key: 'Ctrl+H', id: 'find.replace' },

  // Marxdown を終了する（ADR-0007 論点 3 / 03.ux-spec/04-keybindings.md §3）。
  //
  // **トレイ常駐では `✕` が「格納」の意味になる**ため、「本当に終わらせたい」を
  // 表すキーが別に要る。
  { key: 'Ctrl+Q', id: 'app.quit' },
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
