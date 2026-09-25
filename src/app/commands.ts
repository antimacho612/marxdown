/**
 * 「このアプリで何ができるか」の唯一の表。
 *
 * キーバインド・メニュー・コマンドパレットはすべてこの表を参照する。
 * そのため `features/menu` は `runCommand(id)` だけを呼べばよく、feature 同士が互いの関数名を知らずに済む。
 * 登録元がここ（`app/`）にあるのは、各 feature を把握してよい composition root だからである。
 *
 * クリティカルパスに載るのは `id → run` と `key → id` の 2 表のみである。
 * ラベルは遅延チャンク側（`features/palette/lazy/catalog.ts`）に置いてある。
 */
import {
  documentStore,
  openPath,
  openViaDialog,
  reloadCurrent,
  saveAsSafely,
  saveSafely,
  toggleEol,
} from '@/features/document';
import { formatTableLazily, gotoLineLazily } from '@/features/editor';
import { canGoBack, canGoForward, goBack, goForward } from '@/features/history';
import { cycleMode, openFind, openReplace, setMode, togglePreview, toggleSplit } from '@/features/mode';
import { openJumpLazily, showOutline } from '@/features/outline';
import { openCommandPaletteLazily, openQuickOpenLazily } from '@/features/palette';
import { toggleLeftPane, toggleRightPane } from '@/features/panes';
import { zoomIn, zoomOut, zoomReset } from '@/features/preview';
import { openSettingsLazily } from '@/features/settings';
import { isSatellite, viewStore } from '@/features/view';
import {
  closeTab,
  cycleTab,
  moveCurrentTabToMainLazily,
  moveCurrentTabToSatellite,
  openFolderViaDialog,
  openUntitledTab,
  reopenClosedTab,
  selectTabAt,
  showExplorer,
  tabsStore,
} from '@/features/workspace';
import { registerCommands, runCommand, type Command, type CommandId } from '@/lib/commands';
import { toMessage } from '@/lib/error';
import { bindKeys } from '@/lib/shortcuts';
import { getPlatform } from '@/platform';

/** 文書を開いているか。開いていないと意味を持たないコマンドの一覧条件として使う。 */
function hasDocument(): boolean {
  return documentStore.meta !== null;
}

/**
 * ペインとファイルツリーを持つウィンドウか（F-OPEN-06 / ADR-0016 §3）。
 *
 * サテライトはタブと本文だけを持つ。
 * 押しても何も起きない項目を並べない（Principle 3 / `hasDocument` と同じ判断）。
 */
function hasPanes(): boolean {
  return !isSatellite();
}

/** タブが 2 枚以上あるか。切り替えは 1 枚では意味を持たない。 */
function hasTabs(): boolean {
  return tabsStore.tabs.length > 1;
}

/**
 * 実体の表。
 *
 * `isListed` は一覧に出すかどうかであり、実行できるかどうかではない（`lib/commands.ts` の `Command` を参照）。
 * キーは一覧に出ていなくても動作する。
 */
const COMMANDS: Command[] = [
  // 新規ファイル（`Ctrl+N` / 03.ux-spec/04-keybindings.md §3）。何も開いていなくても実行できる。
  // 新しいタブで開く。いまの文書はタブとして残るため、破棄の確認は要らない。
  { id: 'document.new', run: () => void newUntitled() },

  { id: 'document.open', run: () => void openViaDialogSafely() },

  // フォルダを開く（`Ctrl+Alt+O` / F-NAV-03）。ファイルツリーの基点を決める唯一の操作である（`marxdown <dir>` を除く）。文書を開いていなくても実行できる。
  { id: 'folder.open', run: () => void openFolderSafely(), isListed: hasPanes },

  // 表示中のタブをサテライトへ移す（F-OPEN-06）。
  // キーは割り当てない。使用頻度が低く、覚えるキーを増やす利点がない（`document.toggleEol` と同じ判断）。
  { id: 'window.moveTab', run: () => void moveCurrentTabToSatellite(), isListed: hasDocument },

  // 表示中のタブをメインウィンドウへ戻す（OQ-43）。サテライトの一覧にだけ出す。
  // 実体は遅延チャンクにある。キーを割り当てない理由は `window.moveTab` と同じ。
  {
    id: 'window.moveTabToMain',
    run: () => void moveCurrentTabToMainLazily(),
    isListed: () => isSatellite() && hasDocument(),
  },

  // 一覧（メニュー）には出さない。
  // 対象を指定して開く経路であり、「最近開いたファイル」の 1 件ごとがこれを呼ぶ。
  //
  // 開けなかった場合の通知と履歴からの除去は `openPath` が担当する。
  {
    id: 'document.openPath',
    run: (target) => {
      if (target !== undefined) void openPath(target);
    },
  },

  // クイックオープン（`Ctrl+P` / F-NAV-05）。実体は遅延チャンクにある。
  // 文書を開いていなくても実行できる。
  // 基点が無くても最近開いたファイルは並ぶ。
  { id: 'document.quickOpen', run: () => void openQuickOpenLazily() },

  { id: 'document.reload', run: () => void reloadCurrent(), isListed: hasDocument },

  // 保存（F-EDIT-02）。ダーティでなくても実行できる。
  // 操作しても反応が無い状態を避けるためで、内容が同じならディスク上のバイト列は変わらない。
  { id: 'document.save', run: () => void saveSafely(), isListed: hasDocument },
  { id: 'document.saveAs', run: () => void saveAsSafely(), isListed: hasDocument },

  // 改行コードの変換（F-EDIT-14 / 03.ux-spec/07-status-and-notifications.md §3）。
  // 実体はステータスバーの `LF` / `CRLF` で、ここはコマンドとしての入口である。
  // キーは割り当てない。使用頻度が低く、覚えるキーを増やす利点がない。
  { id: 'document.toggleEol', run: () => toggleEol(), isListed: hasDocument },

  // 戻る / 進む（F-NAV-07）。辿れるときにしか一覧に出さない。
  // 履歴はタブごとに分かれている。対象は表示中のタブである。
  { id: 'history.back', run: () => void goBack(tabsStore.activeId), isListed: () => canGoBack(tabsStore.activeId) },
  {
    id: 'history.forward',
    run: () => void goForward(tabsStore.activeId),
    isListed: () => canGoForward(tabsStore.activeId),
  },

  // ペインとビュー（03.ux-spec/06-panes.md §4）。キーの意味が 2 系統に分かれている。
  //   ペイン: `pane.toggleRight` はライトペインを開閉する。中身が何であるかは問わない。
  //   ビュー: `outline.show` は Outline を表示してフォーカスする。閉じる動作は持たない。
  //
  // 後者がトグルでないのは、アウトラインを見たいという意図に対して常に同じ結果を返すためである。
  // アウトラインを左ペインへ移しても意味が変わらない。
  { id: 'pane.toggleLeft', run: () => toggleLeftPane(), isListed: () => hasDocument() && hasPanes() },
  { id: 'pane.toggleRight', run: () => toggleRightPane(), isListed: () => hasDocument() && hasPanes() },
  { id: 'outline.show', run: () => void showOutline(), isListed: hasPanes },
  // Explorer を出してフォーカスする（`Ctrl+Shift+E`）。`outline.show` と対になるビュー側のキーである。
  { id: 'explorer.show', run: () => void showExplorer(), isListed: hasPanes },

  // 見出しへジャンプ（03.ux-spec/04-keybindings.md §3「移動」）。実体は遅延チャンクにある。
  // コマンドパレット（`Ctrl+Shift+P`）ではなく、見出し専用である。
  { id: 'outline.jump', run: () => void openJumpLazily(), isListed: hasDocument },

  // 表示モードの切り替え（F-MODE-03, 06 / 03.ux-spec/02-view-modes.md §2）。
  //
  // `Ctrl+Shift+V` は Preview と直前の編集モードの往復、`Ctrl+\` は Split のトグル、`Ctrl+Shift+M` は順送りである。
  // 3 つとも意味が違うため、別のコマンドにしてある。
  { id: 'view.togglePreview', run: () => void togglePreview(), isListed: hasDocument },
  { id: 'view.toggleSplit', run: () => void toggleSplit(), isListed: hasDocument },
  // 順送りは一覧に出さない。
  // キーを知っている人のためのものであり、メニューには行き先の分かるトグル 2 つが既に並んでいる。
  { id: 'view.cycleMode', run: () => void cycleMode() },

  // スクロール同期（F-MODE-05 / 03.ux-spec/03-split-mode.md §2）。Split のときだけ意味を持つ。
  // 実体はステータスバーの `⇄` で、ここはコマンドとしての入口である。
  {
    id: 'view.toggleScrollSync',
    run: () => (viewStore.scrollSync = !viewStore.scrollSync),
    isListed: () => viewStore.mode === 'split',
  },

  // 検索と置換（F-VIEW-10 / F-EDIT-05）。
  // id が `preview.` でも `editor.` でもないのは、表示している面によって実体が変わるためである。
  // 振り分けは `features/mode/find.ts` が行う。
  //
  // 置換は Edit だけで有効であり、読んでいる面を書き換える経路は無い。
  { id: 'find.open', run: () => void openFind(), isListed: hasDocument },
  {
    id: 'find.replace',
    run: () => void openReplace(),
    isListed: () => hasDocument() && viewStore.mode !== 'preview',
  },

  // 倍率は Preview 専用ではない。
  // エディターの font-size にも `--mx-zoom` が適用される（`features/editor/lazy/theme.ts`）。
  // id の接頭辞が `preview.` なのは実装の置き場所を示すもので、適用範囲を示すものではない。
  { id: 'preview.zoomIn', run: () => void zoomIn(), isListed: hasDocument },
  { id: 'preview.zoomOut', run: () => void zoomOut(), isListed: hasDocument },
  { id: 'preview.zoomReset', run: () => void zoomReset(), isListed: hasDocument },

  { id: 'settings.open', run: () => void openSettingsLazily() },

  // コマンドパレット（F-NAV-06 / 03.ux-spec/01-screen-layout.md §3）。
  // メニューバーを置かない代わりの、すべての機能への到達手段である。
  // 一覧には出さない。開いている当人を並べても押せない。
  { id: 'palette.open', run: () => void openCommandPaletteLazily() },

  // 指定行へ移動（`Ctrl+G`）。実体は Monaco の組み込みアクションである。
  // Preview では一覧に出さない。
  // 行番号が見えていない面に「指定行へ移動」を並べても選べない。
  {
    id: 'editor.gotoLine',
    run: () => void gotoLineLazily(),
    isListed: () => hasDocument() && viewStore.mode !== 'preview',
  },

  // 表の列幅を揃える（F-EDIT-11 / `Shift+Alt+F`）。
  // `gotoLine` と同じく、カーソルのある面でしか意味を持たないため Preview では一覧に出さない。
  {
    id: 'editor.formatTable',
    run: () => void formatTableLazily(),
    isListed: () => hasDocument() && viewStore.mode !== 'preview',
  },

  // タブ（F-NAV-01, 02 / 03.ux-spec/04-keybindings.md §3）。
  //
  // 閉じるのは表示中のタブである。対象を取らないのは、キーもメニューも「いま見ているもの」を指すためで、個別のタブを閉じるのは `✕`（`TabStrip.svelte`）が直接呼ぶ。
  { id: 'tab.close', run: () => void closeCurrentTab(), isListed: hasDocument },
  // 切り替えは 2 枚以上のときだけ意味を持つ。
  { id: 'tab.next', run: () => void cycleTab(1), isListed: hasTabs },
  { id: 'tab.previous', run: () => void cycleTab(-1), isListed: hasTabs },
  // n 番目のタブ。一覧には出さない（`Ctrl+1`〜`Ctrl+9` を 9 行並べても読めない）。
  {
    id: 'tab.select',
    run: (target) => {
      if (target !== undefined) void selectTabAt(Number(target));
    },
  },
  // 閉じたタブを開き直す。閉じた覚えが無いときに押しても何も起きない。
  { id: 'tab.reopen', run: () => void reopenClosedTab() },

  // 終了（ADR-0007 論点 3）。
  // 確実に終了できる導線を 3 つ用意するという決定のうち、キーとハンバーガーメニューの 2 つがこのコマンドを共有する（残りはトレイメニュー）。
  //
  // ダーティ状態の確認（03.ux-spec/07-status-and-notifications.md §1）もこの経路に入るため、確認を挟む場所は 1 か所で済む。
  { id: 'app.quit', run: () => void getPlatform().quitApp() },
];

interface KeyBinding {
  key: string;
  id: CommandId;
  /**
   * コマンドに渡す対象（`Command.run` の引数）。
   *
   * 使うのは `Ctrl+1`〜`Ctrl+9` だけである。9 つのコマンドを並べる代わりに、同じ id へ番号を渡す。
   */
  target?: string;
}

/**
 * アプリの再読み込みに置き換えるキー（03.ux-spec/04-keybindings.md §3）。
 *
 * WebView の再読み込みは 1 つのキーだけに割り当たっているわけではない。
 * `F5` / `Ctrl+R` が通常の再読み込み、`Ctrl+Shift+R` / `Ctrl+F5` / `Shift+F5` がキャッシュを無視した再読み込みで、Chromium 系ではいずれも動作する。
 * 1 つでも取りこぼすと、そこだけ開いているファイルが失われる経路が残る。
 *
 * トレイ常駐でプロセスの寿命が延びるほど、1 回の誤操作による影響が大きくなる。
 * キャッシュを使うかどうかの違いはアプリ側の再読み込みには存在しないため、すべて同じ動作にする。
 */
const RELOAD_KEYS = ['F5', 'Ctrl+R', 'Ctrl+Shift+R', 'Ctrl+F5', 'Shift+F5'];

/**
 * キーと id の対応（03.ux-spec/04-keybindings.md §3）。
 *
 * アプリ全体で効くものだけを並べる（プレビュー内検索の `F3`/`Escape` のように開いている間だけ効くキーは、その機能のモジュールが自分で `bindKeys` する）。
 * クリティカルパスに載ってよい唯一の形であり、キーバインドのカスタマイズ（F-CONF-09）はこの表を差し替える形で入る。
 *
 * ここに書いたキーはどこにフォーカスがあっても有効である。
 * 境界は「入力中かどうか」ではなく「どちらの表に書いてあるか」であり、モードごとの例外を持たない（03.ux-spec/04-keybindings.md §4）。
 * この表と `features/editor/lazy/keymap.ts`（本文編集用）は重ならないよう、`keymap.ts` 側が重複キーを外している。
 */
export const KEY_BINDINGS: KeyBinding[] = [
  // 新規ファイル（03.ux-spec/04-keybindings.md §3）。
  // そのまま通すと WebView 自身の「新しいウィンドウ」が動作するため、`Ctrl+O` や `Ctrl+S` と同じ理由で必ず既定動作を止める。
  { key: 'Ctrl+N', id: 'document.new' },
  { key: 'Ctrl+O', id: 'document.open' },
  // フォルダを開く（03.ux-spec/04-keybindings.md §3）。
  // VS Code の `Ctrl+K Ctrl+O` に対応するが、和音は採らないため単打の空きキーへ移してある（§2）。
  { key: 'Ctrl+Alt+O', id: 'folder.open' },

  // 保存（F-EDIT-02）。
  // そのまま通すと WebView 自身の「名前を付けて保存」が開き、アプリの本文と無関係な HTML が保存される。
  { key: 'Ctrl+S', id: 'document.save' },
  { key: 'Ctrl+Shift+S', id: 'document.saveAs' },

  // 再読み込みのキーは必ず既定動作を止める。
  //
  // そのまま通すと WebView がページごと再読み込みし、`initialization_script` に載っている起動時の bootstrap が再適用される。
  // その結果、コマンドラインで指定したファイルが、その後に D&D やダイアログで開いたファイルを置き換えて再表示される。
  //
  // 何も開いていないときも同じ理由で既定動作を止める（`reloadCurrent` は何もしない）。
  ...RELOAD_KEYS.map((key) => ({ key, id: 'document.reload' as const })),

  // VS Code と同じ `Ctrl+,`（Familiar）。
  { key: 'Ctrl+,', id: 'settings.open' },

  // Preview ⇄ 直前の編集モード（03.ux-spec/02-view-modes.md §2 の「最も使うトグル」）。
  { key: 'Ctrl+Shift+V', id: 'view.togglePreview' },

  // Split（F-MODE-03 / 03.ux-spec/02-view-modes.md §2）。
  // `Ctrl+\` は VS Code の「エディターを分割」に対応する（Familiar）。
  // `Ctrl+Shift+M` は表示モードの順送りである。
  { key: 'Ctrl+\\', id: 'view.toggleSplit' },
  { key: 'Ctrl+Shift+M', id: 'view.cycleMode' },

  // レフトペイン（F-NAV-04 / 03.ux-spec/04-keybindings.md §3）。VS Code のサイドバーと同じキー。
  { key: 'Ctrl+Shift+B', id: 'pane.toggleLeft' },
  { key: 'Ctrl+Alt+B', id: 'pane.toggleRight' },
  { key: 'Ctrl+Shift+E', id: 'explorer.show' },
  { key: 'Ctrl+Shift+U', id: 'outline.show' },
  { key: 'Ctrl+Shift+O', id: 'outline.jump' },

  // コマンドパレット（F-NAV-06）。
  // `Ctrl+Shift+P` は WebView の開発者ツールには割り当たっていないが（そちらは `Ctrl+Shift+I`）、既定動作を止めておく点は他のキーと同じ扱いにする。
  { key: 'Ctrl+Shift+P', id: 'palette.open' },

  // クイックオープン（F-NAV-05）。
  // `Ctrl+P` は WebView 自身の印刷に割り当たっているため、既定動作を止めること自体に意味がある。
  { key: 'Ctrl+P', id: 'document.quickOpen' },

  // 指定行へ移動（`Ctrl+G`）。Monaco 側の同じキーは `keymap.ts` が外している。
  { key: 'Ctrl+G', id: 'editor.gotoLine' },

  // 戻る / 進む（F-NAV-07）。
  // 相対リンクで辿った先から戻るための経路で、スクロール位置も一緒に復元する（`features/history/navigate.ts`）。
  //
  // Monaco の Windows のキー割り当てでは `Alt+←` は未使用である（単語移動は `Ctrl+←` で、`Alt` 側は macOS のみ）。
  { key: 'Alt+ArrowLeft', id: 'history.back' },
  { key: 'Alt+ArrowRight', id: 'history.forward' },

  // 表示倍率（F-VIEW-11）。
  // そのまま通した `Ctrl+=` / `Ctrl+-` は WebView 自身のズームとして処理されるため、アプリの倍率と二重に適用される（`lib/shortcuts.ts` の「既定動作を必ず止める」）。
  //
  // 倍率は表示中の面ではなく利用者ごとの表示設定であるため、どこにフォーカスがあっても動作するのが正しい（VS Code も同じ）。
  { key: 'Ctrl+=', id: 'preview.zoomIn' },
  { key: 'Ctrl+-', id: 'preview.zoomOut' },
  { key: 'Ctrl+0', id: 'preview.zoomReset' },

  // 検索・置換（F-VIEW-10 / F-EDIT-05）。ここにあるのは開くキーだけである。
  // 開いている間だけ有効な `F3` / `Escape` は、Preview では検索モジュールが自分で登録して自分で解除し、Edit では Monaco の検索ウィジェットが処理する。
  //
  // `Ctrl+F` は WebView 自身の検索にも割り当たっているため、既定動作を止めること自体に意味がある。
  // `Ctrl+H` が Preview では何もしないのに登録してあるのも同じ理由である。
  { key: 'Ctrl+F', id: 'find.open' },
  { key: 'Ctrl+H', id: 'find.replace' },

  // Marxdown を終了する（ADR-0007 論点 3 / 03.ux-spec/04-keybindings.md §3）。
  //
  // トレイ常駐では `✕` が格納の意味になるため、明示的に終了するキーが別に必要になる。
  { key: 'Ctrl+Q', id: 'app.quit' },

  // タブ（03.ux-spec/04-keybindings.md §3「移動」「ファイル」）。
  //
  // `Ctrl+Tab` は WebView 自身のフォーカス移動にも割り当たっているため、既定動作を止めること自体に意味がある。
  // `Ctrl+W` はブラウザではウィンドウを閉じるキーであり、こちらは必ず止める（トレイ常駐のため、閉じるべきはタブである / ADR-0007）。
  { key: 'Ctrl+Tab', id: 'tab.next' },
  { key: 'Ctrl+Shift+Tab', id: 'tab.previous' },
  { key: 'Ctrl+W', id: 'tab.close' },
  { key: 'Ctrl+Shift+T', id: 'tab.reopen' },
  // n 番目のタブ。番号は `target` で渡す（`KeyBinding.target`）。
  ...Array.from({ length: 9 }, (_, i) => ({ key: `Ctrl+${i + 1}`, id: 'tab.select' as const, target: String(i + 1) })),
];

/**
 * 登録してある id の一覧。
 *
 * コマンドパレットのカタログ（`features/palette/lazy/catalog.ts`）との突き合わせに使う。
 * パレットは「すべての機能への到達手段」であり、載せ忘れは機能が埋もれることを意味するため、目視ではなく `catalog.test.ts` が機械的に検証する。
 */
export const COMMAND_IDS: CommandId[] = COMMANDS.map((command) => command.id);

/**
 * コマンドだけを登録する。返り値を呼ぶと解除される。
 *
 * キーを割り当てない入口を分けてあるのは、Storybook がここだけを呼ぶためである。
 * メニューは id しか持たないため、登録が無いと項目が 1 つも表示されない。
 * 一方で Storybook でグローバルキーまで有効にすると、`Ctrl+F` がブラウザの検索ではなくアプリの検索を開いてしまう。
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
        runCommand(binding.id, binding.target);
      },
    })),
  );

  return () => {
    unbind();
    unregister();
  };
}

/**
 * 無題の文書を新しいタブで開き、編集できるモードへ移す（`Ctrl+N`）。
 *
 * モードの切り替えをここで行うのは、`features/workspace` が表示モードを知らないためである。
 * 複数の feature をまたぐ組み立ては composition root の仕事である。
 */
async function newUntitled(): Promise<void> {
  if (await openUntitledTab()) await setMode('edit');
}

/**
 * 表示中のタブを閉じる（`Ctrl+W`）。
 *
 * 何も開いていなければ何もしない。
 * トレイ常駐（ADR-0007）では、タブが無いこととアプリが終わることは別である。
 */
async function closeCurrentTab(): Promise<void> {
  const id = tabsStore.activeId;
  if (id !== null) await closeTab(id);
}

/**
 * ダイアログを開く（F-OPEN-07）。
 *
 * ダイアログ自体の失敗（プラットフォーム側の異常）は通知に出す。
 * 取り消しは失敗ではないため、何も表示しない。
 */
async function openViaDialogSafely(): Promise<void> {
  try {
    await openViaDialog();
  } catch (e) {
    documentStore.notice = { level: 'error', message: toMessage(e) };
  }
}

/**
 * フォルダを開くダイアログ（`Ctrl+Alt+O`）。
 *
 * 失敗の扱いは `openViaDialogSafely` と同じで、取り消しは失敗ではない。
 */
async function openFolderSafely(): Promise<void> {
  try {
    await openFolderViaDialog();
  } catch (e) {
    documentStore.notice = { level: 'error', message: toMessage(e) };
  }
}
