/**
 * Monaco の生成と保持（F-EDIT-01 / `editor` チャンク / ADR-0009）。
 *
 * Edit / Split / WYSIWYG は単一のエディター・単一のモデルを共有し、置き場所だけが違う（02.architecture/07-editor-wysiwyg.md §1）。
 * これにより Undo 履歴・カーソル・IME の挙動がモード間で揃う。
 * Preview へ切り替えても `dispose()` しない（Undo 履歴を保持するため / §4）。
 * ただし Monaco は非表示のあいだ寸法を失うので、表示を戻したら `relayoutEditor()` を呼ぶこと。
 * タブを閉じたときに破棄するのはそのタブのモデルだけで、エディター本体は破棄しない（N-PERF-06）。
 *
 * `#mx-editor` は `index.html` にあり Svelte 管理下に無い（`#mx-preview` と同じ理由 / ADR-0005）。
 * Monaco はモデルの EOL を自分で推定するため、明示的に LF を指定して読み書きしないと CRLF が混ざる（N-CMP-03）。
 */
import { attachEditor, getDocumentText, scheduleLiveRender, setDirty } from '@/features/document';
import { settingsStore } from '@/features/settings';
import { attachEditorScrollPort, startScrollSync, stopScrollSync } from '@/features/view';

import { installCursorReport } from './cursor';
import { runEdit } from './edits';
import { installHeadingFolding } from './folding';
import { installEditorKeymap } from './keymap';
import { MARKDOWN_LANGUAGE_ID, monaco } from './monaco';
import { applyEditorOptions, editorOptions } from './options';
import { applyEditorPalette, installEditorPalette } from './palette';
import { installPaste } from './paste';
import { createScrollPort } from './scroll-port';
import { formatTable } from './table';
import { applyEditorTheme, watchEditorTokens } from './theme';
import { watchEditorSettings } from './watch-settings.svelte';

let editor: monaco.editor.IStandaloneCodeEditor | null = null;

/**
 * タブ 1 つが保持するもの。
 *
 * Undo 履歴はモデルが持つ。
 * タブごとに分けないと、切り替えた先で Undo したときに前の文書の本文が編集面へ入る。
 * そのまま保存すればファイル全体が別物になる（N-CMP-03 / `document/text.ts` の `switchTo`）。
 *
 * `viewState` はカーソルとスクロール位置である。同じタブへ戻ったときに読んでいた場所から続けられる。
 */
interface TabModel {
  model: monaco.editor.ITextModel;
  /** 何の文書か（パス）。同じタブでも別の文書へ移ったらモデルごと作り直す。 */
  documentId: string;
  /**
   * ダーティ判定の基準（F-EDIT-03）。`markClean()` が呼ばれるたびに、そのときの版へ動かす（`sync`）。
   *
   * 内容が変わったことだけを見ると、Undo で編集前の内容まで戻ってもダーティのままになる。
   * `getAlternativeVersionId()` は Undo でその版へ戻ると同じ値に戻るため、本文を文字列で比較しなくても基準と同じ内容かどうかを判定できる。
   */
  cleanVersionId: number;
  /** カーソルとスクロール位置。切り替えて離れるときに保存する。 */
  viewState: monaco.editor.ICodeEditorViewState | null;
  /** 内容の購読。モデルを破棄するときに一緒に解除する。 */
  subscription: monaco.IDisposable;
}

const tabModels = new Map<number, TabModel>();

/** いま編集面に表示しているタブ。まだ何も表示していなければ `null`。 */
let currentKey: number | null = null;

/** いま表示しているモデル。 */
function currentModel(): monaco.editor.ITextModel | null {
  return editor?.getModel() ?? null;
}

/** 本文を LF で読む。モデルが CRLF を保持していても、返すのは LF に正規化した文字列である。 */
function readText(): string {
  return currentModel()?.getValue(monaco.editor.EndOfLinePreference.LF) ?? '';
}

/** いま表示しているタブの記録。 */
function currentEntry(): TabModel | null {
  if (currentKey === null) return null;
  return tabModels.get(currentKey) ?? null;
}

/**
 * モデルを 1 つ作り、ダーティ状態の購読を登録する。
 *
 * `EOL` は明示的に LF にする。Monaco は内容から推定するため、指定しないと CRLF が混ざる（N-CMP-03）。
 */
function createTabModel(documentId: string, text: string): TabModel {
  const model = monaco.editor.createModel(text, MARKDOWN_LANGUAGE_ID);
  model.setEOL(monaco.editor.EndOfLineSequence.LF);

  const entry: TabModel = {
    model,
    documentId,
    cleanVersionId: model.getAlternativeVersionId(),
    viewState: null,
    subscription: model.onDidChangeContent(() => {
      // ダーティ状態（F-EDIT-03）。boolean 1 つだけがリアクティビティを通り、本文そのものは通らない（ADR-0005）。
      // `setDirty` は値が変わらなければ何もしない。
      //
      // `editor.onDidChangeModelContent` ではなくモデル側を購読する。
      // エディターの通知は Undo で版を巻き戻す前に発火するため、それで判定すると Undo で基準まで戻ってもダーティが外れない。
      //
      // 表示していないモデルからは通知しない。背後のモデルが切り替え先の状態を上書きしてしまう。
      if (model !== currentModel()) return;
      setDirty(model.getAlternativeVersionId() !== entry.cleanVersionId);
      // Split では右のプレビューを追いかけさせる（F-MODE-03）。
      // 打鍵ごとには再描画しない（`document/live.ts` が待つ）。
      scheduleLiveRender();
    }),
  };
  return entry;
}

/** 記録ごと破棄する。購読も一緒に解除する。 */
function disposeEntry(entry: TabModel): void {
  entry.subscription.dispose();
  entry.model.dispose();
}

/**
 * エディターをマウントする。2 回目以降は何もしない。
 *
 * 初期内容は `getDocumentText()` から取得する。
 * `attachEditor` より前に読むこと（後にすると、保持分を破棄した後の空文字を読むことになる）。
 */
export function mountEditor(host: HTMLElement): monaco.editor.IStandaloneCodeEditor {
  if (editor) return editor;

  const doc = getDocumentText();

  editor = monaco.editor.create(host, {
    // モデルはマウント後に設定する（`switchTo`）。
    // ここで作ると、どのタブのものかが決まらないまま 1 つ目のモデルができる。
    model: null,
    // コンテナのサイズに追随させる（ResizeObserver）。
    // 非表示の間は動作しないため、面を表示し直したときは `relayoutEditor()` で明示的に測り直す。
    automaticLayout: true,

    // 見た目と編集の挙動は設定から来る（`options.ts` / F-CONF-04）。
    // 折り返し・行番号・タブ幅・フォント・カーソルなどはすべてそちらにある。
    ...editorOptions(settingsStore.values),

    /*
     * ここから下は設定項目にしないと決めたものである。理由は 4 つに分かれる。
     * 追加するときは `options.ts` の冒頭を読むこと。
     */

    // 概要ルーラは表示しない。
    // Markdown では表示する情報がほとんど無く、表示すると本文の幅がそのぶん狭くなる。
    overviewRulerLanes: 0,
    overviewRulerBorder: false,
    hideCursorInOverviewRuler: true,
    // 03.ux-spec/09-motion.md の禁則。スクロールにアニメーションを追加しない。
    // 設定項目にしないのは、設定から禁則を無効化できる形にしないためである。
    smoothScrolling: false,

    // 触っていない箇所のバイト列を変えない（N-CMP-03）。
    // 以下はいずれも編集箇所以外を自動で書き換える機能である。
    // 不変条件に属するため、設定項目にしない。
    detectIndentation: false,
    trimAutoWhitespace: false,
    formatOnPaste: false,
    formatOnType: false,
    autoIndent: 'keep',

    // コピーしたときにクリップボードへ入れるのはテキストだけにする。
    // 有効のままだと、編集面の配色（背景色を含む）とコードフォントを指定した HTML も入り、Word や Outlook へ貼ると暗い背景の等幅ブロックになる。
    // Markdown はテキストとして持ち出すものであり、見た目を付けて渡す理由が無いため設定項目にしない。
    copyWithSyntaxHighlighting: false,

    // Markdown に補完は不要である。editor worker を起動する経路でもある。
    // Non-goal（IDE）に近づくため設定項目にしない。
    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
    wordBasedSuggestions: 'off',
    // 語のハイライトは選択範囲と一致するものだけでよい。
    // `occurrencesHighlight` は言語サービス（DocumentHighlightProvider）を必要とするため無効にする。
    occurrencesHighlight: 'off',
    selectionHighlight: true,
    // 曖昧な文字と不可視文字の警告は、日本語の本文では常時表示される。
    // 有効化する設定を用意する利点がない。
    unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false },
  });

  // テーマ（CSS トークン由来）と設定（`settings.json` 由来）は適用先が同じ 1 つのインスタンスであるため、入口も 1 つにしておく。
  const instance = editor;
  const refreshAppearance = (): void => {
    // 配色を先に適用する（ADR-0014）。
    // `applyEditorTheme` は面に適用されているトークンを読み出すため、後にすると既定の色を反映することになる。
    applyEditorPalette();
    applyEditorTheme();
    applyEditorOptions(instance);
  };

  refreshAppearance();

  // 組み込みの配色は遅延チャンクにある（ADR-0014）。
  // 待たないのは、`#mx-editor` がまだ空だからである。読み込めた時点で再適用される。
  void installEditorPalette(refreshAppearance);
  // 監視対象が 2 つあるのは、変化が 2 系統あるためである。
  // トークン（テーマ / プレビューの設定 / 表示倍率）は CSS に現れ、エディターの設定（折り返し・タブ幅など）は現れない。
  watchEditorTokens(refreshAppearance);
  watchEditorSettings(refreshAppearance);

  // Markdown の書式（F-EDIT-08）とリストの継続入力（F-EDIT-09, 10）。
  // アプリ側が処理するキーを Monaco から外すのもここで行う（`keymap.ts`）。
  installEditorKeymap(editor);
  // 選択範囲への URL 貼り付け（F-EDIT-12）と画像の貼り付け（F-EDIT-13）。
  // 渡すのは `host` である（`editor.getDomNode()` はこの時点でまだ `null` / `paste.ts`）。
  installPaste(editor, host);
  // カーソル位置をステータスバーへ通知する（03.ux-spec/07-status-and-notifications.md §3）。更新は rAF で間引く（`cursor.ts`）。
  installCursorReport(editor);
  // 見出し単位の折りたたみと、見出しの上端への固定表示（`folding.ts`）。
  installHeadingFolding(editor);

  // 行番号だけを扱うインタフェースを渡す（`features/view/scroll-sync.ts`）。
  // Split に入る前から渡しておく。
  // アウトラインからのジャンプは Edit でも動作する必要があり、そこで必要になるのは同期ではなくこのインタフェースそのものである。
  attachEditorScrollPort(createScrollPort(editor));

  // ここから先、本文の真実は Monaco のモデルにある（ADR-0005）。
  attachEditor({
    read: () => (currentModel() ? readText() : doc),
    replace: (text) => {
      const current = currentModel();
      if (!current) return;
      // Undo の履歴に残す。`setValue` にすると履歴が失われる。
      // ここを通るのは同じ文書の読み直し（`F5` / 外部変更）だけである。別の文書へ移るときは `switchTo` を通る。
      current.pushEditOperations(null, [{ range: current.getFullModelRange(), text }], () => null);
    },
    replaceLine: (line, text) => {
      const current = currentModel();
      if (!current) return;
      // Monaco の行番号は 1 始まり。`data-line` は 0 始まりである。
      const number = line + 1;
      if (number < 1 || number > current.getLineCount()) return;
      // Undo の 1 回分として履歴に残す。プレビュー上でチェックした後、`Ctrl+Z` で戻せる。
      current.pushEditOperations(
        null,
        [
          {
            range: current
              .getFullModelRange()
              .setStartPosition(number, 1)
              .setEndPosition(number, current.getLineMaxColumn(number)),
            text,
          },
        ],
        () => null,
      );
    },
    sync: () => {
      const entry = currentEntry();
      if (entry) entry.cleanVersionId = entry.model.getAlternativeVersionId();
    },
    switchTo: switchToDocument,
    dispose: disposeTabModel,
    relabel: (key, documentId) => {
      const entry = tabModels.get(key);
      if (entry) entry.documentId = documentId;
    },
  });

  return editor;
}

/**
 * 編集面に表示する文書を切り替える（`document/text.ts` の `switchTo`）。
 *
 * 同じタブの同じ文書なら、モデルをそのまま使う。
 * 読み直し（`F5` / 外部変更）でここへ来ることがあり、そのときは内容だけを差し替えて Undo 履歴を残す。
 *
 * 別の文書ならモデルごと作り直す。
 * 引き継ぐと、Undo で前の文書の本文が編集面へ入る（`document/text.ts` の `switchTo`）。
 * 1 タブ 1 モデルとし、同じタブで別の文書を開いたときは前のモデルを破棄する。
 */
function switchToDocument(key: number, documentId: string, text: string): void {
  const target = editor;
  if (!target) return;

  // 離れる前にカーソルとスクロール位置を控える。
  const leaving = currentEntry();
  if (leaving) leaving.viewState = target.saveViewState();

  const existing = tabModels.get(key);
  let entry = existing;

  if (existing && existing.documentId !== documentId) {
    disposeEntry(existing);
    entry = undefined;
  }

  if (entry === undefined) {
    entry = createTabModel(documentId, text);
    tabModels.set(key, entry);
  }

  currentKey = key;
  target.setModel(entry.model);

  // 同じ文書に戻ってきた場合だけ、内容の差し替えが要る（読み直し）。
  // 作ったばかりのモデルは既にその内容である。
  if (entry === existing && entry.model.getValue(monaco.editor.EndOfLinePreference.LF) !== text) {
    // Undo の履歴に残す。読み直しは「同じ文書の続き」であり、取り消せることに意味がある。
    entry.model.pushEditOperations(null, [{ range: entry.model.getFullModelRange(), text }], () => null);
  }

  if (entry.viewState) target.restoreViewState(entry.viewState);
}

/**
 * そのタブのモデルを破棄する（タブを閉じたとき / N-PERF-06）。
 *
 * 表示中のモデルを破棄する場合は、先に編集面から外す。
 * 外さずに `dispose()` すると、Monaco が破棄済みのモデルを描画し続けようとする。
 */
function disposeTabModel(key: number): void {
  const entry = tabModels.get(key);
  if (!entry) return;

  if (currentKey === key) {
    editor?.setModel(null);
    currentKey = null;
  }
  disposeEntry(entry);
  tabModels.delete(key);
}

/** マウント済みか。モード切り替えの判断に使う。 */
export function isEditorMounted(): boolean {
  return editor !== null;
}

/** フォーカスを移す。Edit へ切り替えた直後から入力できるようにする。 */
export function focusEditor(): void {
  editor?.focus();
}

/**
 * コンテナの大きさを測り直す（`features/mode/mode.ts` が面を表示したときに呼ぶ）。
 *
 * `display: none` の間、Monaco は寸法を保持しない。
 * `automaticLayout` の ResizeObserver は非表示の間は動作しないため、表示を戻した時点で測り直す。
 *
 * 次のフレームで測るのは、属性を設定した直後はまだレイアウトが確定していないためである（`mode.ts` がプレビューのスクロール位置を戻すときと同じ理由）。
 */
export function relayoutEditor(): void {
  const target = editor;
  if (!target) return;
  requestAnimationFrame(() => {
    target.layout();
  });
}

/**
 * 検索・置換を開く（F-EDIT-05）。
 *
 * マウントされていなければ何もしない。
 * Preview を表示しているときの `Ctrl+F` は本文検索へ振り分けられるため、この関数には到達しない（`features/mode/find.ts`）。
 */
export function openEditorSearch(replace: boolean): void {
  if (!editor) return;
  const id = replace ? 'editor.action.startFindReplaceAction' : 'actions.find';
  void editor.getAction(id)?.run();
}

/**
 * 指定行へ移動する（`Ctrl+G`）。
 *
 * Monaco の組み込みアクションをそのまま実行する。行番号の入力欄も Monaco が持っている。
 */
export function gotoLine(): void {
  if (!editor) return;
  editor.focus();
  void editor.getAction('editor.action.gotoLine')?.run();
}

/**
 * カーソルのある表の列幅を揃える（F-EDIT-11 / `Shift+Alt+F`）。
 *
 * キーからは `keymap.ts` が直接呼ぶ。ここを通るのはコマンドパレットからの実行だけである。
 * 表の中にカーソルが無ければ何も起きない。
 */
export function formatTableAtCursor(): void {
  if (!editor) return;
  editor.focus();
  runEdit(editor, formatTable, 'markdown.table');
}

/**
 * 検索・置換を閉じる（Split でプレビュー側の検索へ移るとき / `features/mode/find.ts`）。
 *
 * `getAction` では取得できない。
 * 閉じる処理は `registerEditorAction` ではなく `registerEditorCommand` で登録されており（`contrib/find/browser/findController.js`）、アクション一覧には含まれない。
 * `trigger` はアクションの次にエディターコマンドを検索するため、こちらなら実行できる。
 *
 * ウィジェットが表示されていない場合は precondition（`CONTEXT_FIND_WIDGET_VISIBLE`）で実行されないため、呼び出し側が状態を持つ必要はない。
 */
export function closeEditorSearch(): void {
  editor?.trigger('marxdown.find', 'closeFindWidget', null);
}

/**
 * 1 文字打つ（`features/bench/input.ts` / 計測専用）。
 *
 * 合成した `KeyboardEvent` は `keyCode` が 0 で Monaco のキー解決を通らないため、E2E の実キー入力（1 打 50〜150ms）では「速く打っているあいだの反応の遅れ」を再現できない。
 * `type` は Monaco 自身のキーハンドラが最終的に呼ぶ入口と同じで、ブラウザのキー配送だけが本番と異なる。
 * `source` に `'keyboard'` を渡すのは `enter.ts` と同じ理由である（`autoIndent: 'keep'` を通す文字列）。
 */
export function typeForBench(text: string): void {
  editor?.trigger('keyboard', 'type', { text });
}

/**
 * カーソルを末尾へ置く（`features/bench/input.ts` / 計測専用）。
 *
 * 入力位置を決めておかないと、`huge.md` では 1 行目の見出しを伸ばし続けることになる。
 * 実際の入力は表示している位置に対して行われるため、そこへ移動してから計測を始める。
 */
export function moveToEndForBench(): void {
  const current = currentModel();
  if (!editor || !current) return;
  const lineNumber = current.getLineCount();
  editor.setPosition({ lineNumber, column: current.getLineMaxColumn(lineNumber) });
  editor.revealLine(lineNumber);
}

/**
 * Split のスクロール同期を始める / やめる（F-MODE-05）。
 *
 * エディターの実体を外部へ渡さないためのラッパーである。
 * 同期の中身（`features/view/scroll-sync.ts`）は行番号だけを扱うインタフェース（`EditorScrollPort`）しか知らず、座標計算は `scroll-port.ts` にある。
 */
export function setSplitSync(on: boolean): void {
  if (on) startScrollSync();
  else stopScrollSync();
}
