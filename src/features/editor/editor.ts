/**
 * Monaco の生成と保持（F-EDIT-01 / `editor` チャンク / [ADR-0009](../../../docs/adr/0009-editor-engine-monaco.md)）。
 *
 * # 1 インスタンスしか作らない
 *
 * 02.architecture/07-editor-wysiwyg.md §1 の単一エンジン方針。Edit / Split / WYSIWYG は
 * **同一のエディタと同一のモデル**で、違うのはどこに置くかだけ。
 * これにより Undo 履歴・カーソル・IME の挙動がモード間で揃う
 * （03.ux-spec/02-view-modes.md §4）。
 *
 * # Preview へ戻っても壊さない
 *
 * モードを Preview に切り替えても `dispose()` しない。**Undo 履歴が消えるため。**
 * §4 は「モードを切り替えても Undo 履歴を保持する」を要求している。
 * 隠すのは CSS の担当（`styles/shell.css` の `data-mx-mode`）。
 *
 * **ただし Monaco は隠れているあいだ寸法を失う。** `display: none` から戻したら
 * `relayoutEditor()` を呼ぶこと（`features/view/mode.ts` がプレビューの
 * スクロール位置を戻すのと同じ場所・同じ理由）。
 *
 * 破棄するのはタブを閉じるときだけで、それは M3（N-PERF-06）。
 *
 * # 本文の受け皿はコンポーネントツリーの外
 *
 * `#mx-editor` は `index.html` にあり、Svelte の管理下に無い。
 * `#mx-preview` と同じ理由で、**ここを Svelte に移さないこと**（ADR-0005）。
 *
 * # 改行は必ず LF で読み書きする
 *
 * メモリ上の本文は LF に正規化されており、CRLF / BOM の復元は Rust 側の境界が持つ
 * （N-CMP-03 / 02.architecture/04-rust-responsibilities.md）。
 * Monaco のモデルは**自分で EOL を推定して保持する**ので、
 * 明示的に LF を指定して読み書きしないと、ここで CRLF が混ざる。
 */
import { setDirty } from '@/features/document/dirty';
import { scheduleLiveRender } from '@/features/document/live';
import { attachEditor, getDocumentText } from '@/features/document/text';
import { startScrollSync, stopScrollSync } from '@/features/view/scroll-sync';

import { installEditorKeymap } from './keymap';
import { MARKDOWN_LANGUAGE_ID, monaco } from './monaco';
import { installUrlPaste } from './paste';
import { createScrollPort } from './scroll-port';
import { applyEditorAppearance, watchEditorAppearance } from './theme';

let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let model: monaco.editor.ITextModel | null = null;
let overflowWidgetsDomNode: HTMLDivElement | null = null;

/**
 * ダーティ判定の基準（F-EDIT-03）。`markClean()` が呼ばれるたびに、
 * そのときの版へ動かす（`sync`）。
 *
 * 内容が変わったことだけを見ると、Undo で編集前の内容まで戻ってもダーティのままになる（#43）。
 * **`getAlternativeVersionId()` は Undo でその版へ戻ると同じ値に戻る**ので、
 * 本文を文字列で比較しなくても「基準と同じ内容か」が分かる。
 */
let cleanVersionId = 0;

/** 本文を LF で読む。モデルが CRLF を持っていても、外へ出るのは LF。 */
function readText(): string {
  return model?.getValue(monaco.editor.EndOfLinePreference.LF) ?? '';
}

/**
 * エディタを載せる。**2 回目以降は何もしない。**
 *
 * 初期内容は `getDocumentText()` から取る。`attachEditor` より**前**に読むこと
 * （後にすると、控えを捨てたあとの空文字を読む）。
 */
export function mountEditor(host: HTMLElement): monaco.editor.IStandaloneCodeEditor {
  if (editor) return editor;

  const doc = getDocumentText();

  model = monaco.editor.createModel(doc, MARKDOWN_LANGUAGE_ID);
  model.setEOL(monaco.editor.EndOfLineSequence.LF);

  // content widget / overlay widget（パラメータヒントや将来の suggest 等）を
  // `body` 直下に出す。**指定しないとエディタコンテナ（`.mx-editor`）を
  // 基準にした `position: absolute` になり、コンテナ上端に近いウィジェットは
  // 上に出そうとしてコンテナの外（画面外）へはみ出す**（`styles/shell.css` の
  // `.mx-editor-overflow-widgets`）。`monaco-editor` クラスは、テーマの
  // 色（CSS 変数）をこのノード配下にも効かせるために要る。
  //
  // **find widget のアイコンのようなツールチップ（`IHoverService`）には
  // 効かない。** そちらは別経路で、コンテナ自身を基準にした絶対配置に
  // 固定されている（下の `watchHoverOverlapWithTitlebar` を参照）。
  overflowWidgetsDomNode = document.createElement('div');
  overflowWidgetsDomNode.className = 'monaco-editor mx-editor-overflow-widgets';
  document.body.append(overflowWidgetsDomNode);

  editor = monaco.editor.create(host, {
    model,
    overflowWidgetsDomNode,
    // 器の大きさに追随させる（ResizeObserver）。**隠れている間は効かない**ので、
    // 面を出し直したときは `relayoutEditor()` で明示的に測り直す。
    automaticLayout: true,

    // 読む面と揃える見た目
    wordWrap: 'on',
    lineNumbers: 'on',
    // Markdown では価値が薄く、画面を狭める（ADR-0001 から引き継ぐ判断）。
    minimap: { enabled: false },
    // 概要ルーラも同じ理由で出さない。CodeMirror にも無かったので、
    // 面の見た目は M2 Phase 5 までと変わらない。
    overviewRulerLanes: 0,
    overviewRulerBorder: false,
    hideCursorInOverviewRuler: true,
    renderLineHighlight: 'line',
    renderControlCharacters: true,
    renderWhitespace: 'none',
    // 記号の色分けは Markdown の構造に対して意味を持たない。静かにしておく。
    bracketPairColorization: { enabled: false },
    scrollbar: { horizontal: 'hidden' },
    // 03.ux-spec/09-motion.md の禁則。スクロールに演出を足さない。
    smoothScrolling: false,

    // **触っていない箇所のバイト列を変えない**（N-CMP-03）。
    // 以下はどれも「気を利かせて別の場所を書き換える」機能である。
    detectIndentation: false,
    trimAutoWhitespace: false,
    formatOnPaste: false,
    formatOnType: false,
    autoIndent: 'keep',
    tabSize: 2,
    insertSpaces: true,

    // Markdown に補完は要らない。**editor worker を起こす経路でもある。**
    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
    wordBasedSuggestions: 'off',
    // 語のハイライトは「選択と同じもの」だけでよい。`occurrencesHighlight` は
    // 言語サービス（DocumentHighlightProvider）を要求するので切る。
    occurrencesHighlight: 'off',
    selectionHighlight: true,
    // 曖昧・不可視文字の警告は、日本語の本文では鳴りっぱなしになる。
    unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false },
  });

  // 載せた時点の内容がダーティ判定の基準（マウント前はダーティになりようがない）。
  cleanVersionId = model.getAlternativeVersionId();

  // ダーティ状態（F-EDIT-03）。**boolean 1 つだけがリアクティビティを通る。**
  // 本文そのものはここを通らない（ADR-0005 / 02.architecture/08-state-management.md §1）。
  //
  // `setDirty` は値が変わらなければ何もしないので、打鍵ごとにストアの書き込みや
  // IPC が走ることはない（`document/save.ts`）。
  //
  // > **`editor.onDidChangeModelContent` ではなく、モデル側を購読する。**
  // > Monaco の変更通知は 2 本ある。エディタが購読しているのは編集と同時に飛ぶ
  // > 「速い」ほうで、**そちらは Undo で版を巻き戻す前に飛ぶ**
  // > （`textModel.js` の `_applyUndoRedoEdits` は `_overwriteAlternativeVersionId` を
  // > 呼んでから `endDeferredEmit()` する）。速いほうで判定すると、Undo で
  // > 基準まで戻ってもダーティが外れない（#43 の再来）。実測で確認済み。
  model.onDidChangeContent(() => {
    setDirty(model?.getAlternativeVersionId() !== cleanVersionId);
    // Split では右のプレビューを追いかけさせる（F-MODE-03）。
    // 打鍵ごとには描き直さない（`document/live.ts` が待つ）。
    scheduleLiveRender();
  });

  applyEditorAppearance(editor);
  watchEditorAppearance(editor);

  // Markdown の書式（F-EDIT-08）とリストの継続入力（F-EDIT-09, 10）。
  // **アプリが握るキーを Monaco から剥がすのもここ**（`keymap.ts`）。
  installEditorKeymap(editor);
  // 選択範囲への URL 貼り付け（F-EDIT-12）。
  installUrlPaste(editor);
  watchHoverOverlapWithTitlebar(host);

  // ここから先、本文の真実は Monaco のモデルにある（ADR-0005）。
  attachEditor({
    read: () => (model ? readText() : doc),
    replace: (text) => {
      const current = model;
      if (!current) return;
      // **Undo の履歴に載せる。** ここを `setValue` にすると履歴ごと消える。
      current.pushEditOperations(null, [{ range: current.getFullModelRange(), text }], () => null);
    },
    sync: () => {
      cleanVersionId = model?.getAlternativeVersionId() ?? 0;
    },
  });

  return editor;
}

/**
 * find widget のアイコンに出る Monaco 標準のツールチップが、
 * カスタムタイトルバーの領域にはみ出す問題への事後補正。
 *
 * Monaco の `HoverWidget` は上下どちらに出すか判定する際、ウィンドウの
 * 物理的な上端（y=0）だけを基準にしており、アプリ独自のタイトルバーが
 * 画面上部を占有していることを考慮しない
 * （`node_modules/monaco-editor/esm/vs/platform/hover/browser/hoverWidget.js`
 * の `target.top - hoverHeight < 0` 判定）。ツールバーがタイトルバーの
 * すぐ下にあると「上に十分な余白がある」と誤判定され、タイトルバーに
 * 重なって表示される。`overflowWidgetsDomNode` を指定しても、この
 * ホバー（`IHoverService`）は経路が別で、コンテナ（`.mx-editor`）を
 * 基準にした絶対配置のまま変わらない。
 *
 * Monaco 側に回避手段が無いため、描画後にタイトルバーの高さまで
 * 押し下げる。**Monaco の内部 DOM（`.context-view` / `top` クラス）に
 * 依存する事後補正。** `.context-view` はホバーのたびに作り直されず
 * 使い回されるので、`class` / `style` の変化を見張る必要がある。
 * Monaco の更新でここが変わっても、ツールチップがタイトルバーに
 * 重なる程度の見た目の崩れに留まり、機能は壊れない。
 */
function watchHoverOverlapWithTitlebar(host: HTMLElement): void {
  const titlebarHeight = (): number => {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--mx-titlebar-height');
    // eslint-disable-next-line unicorn/prefer-number-coercion -- `16px` の単位を落とすために必要
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  // 自分で `top` を書き換えた結果をまた観測してしまうが、2 回目は
  // `overlap <= 0` になって早期リターンするので 1 往復で収まる。
  const adjust = (view: HTMLElement): void => {
    if (!view.classList.contains('top')) return;
    const overlap = titlebarHeight() - view.getBoundingClientRect().top;
    if (overlap <= 0) return;
    // eslint-disable-next-line unicorn/prefer-number-coercion -- `0px` の単位を落とすために必要
    view.style.top = `${Number.parseFloat(view.style.top || '0') + overlap}px`;
  };

  const watchView = (view: HTMLElement): void => {
    adjust(view);
    new MutationObserver(() => adjust(view)).observe(view, { attributes: true, attributeFilter: ['class', 'style'] });
  };

  // `.context-view` は最初の表示時に一度だけ `host` へ追加され、以降は
  // 使い回される（`class` / `style` の書き換えのみ）ので、子要素の追加は
  // ここでしか拾えない。
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement && node.classList.contains('context-view')) watchView(node);
      }
    }
  }).observe(host, { childList: true });
}

/** 載っているか。モード切り替えの判断に使う。 */
export function isEditorMounted(): boolean {
  return editor !== null;
}

/** フォーカスを移す。Edit へ切り替えたら、そのまま打てるようにする。 */
export function focusEditor(): void {
  editor?.focus();
}

/**
 * 器の大きさを測り直す（`features/view/mode.ts` が面を出したときに呼ぶ）。
 *
 * **`display: none` のあいだ Monaco は寸法を失う。** `automaticLayout` の
 * ResizeObserver は隠れているあいだ動かないので、戻したときに測り直す。
 *
 * 次のフレームで測るのは、属性を立てた直後はまだレイアウトが確定していないため
 * （`mode.ts` がプレビューのスクロール位置を戻すときと同じ理由）。
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
 * **載っていなければ何もしない。** Preview を見ているときの `Ctrl+F` は
 * 本文検索へ行くので、ここまで来ない（`features/view/find.ts`）。
 */
export function openEditorSearch(replace: boolean): void {
  if (!editor) return;
  const id = replace ? 'editor.action.startFindReplaceAction' : 'actions.find';
  void editor.getAction(id)?.run();
}

/**
 * Split のスクロール同期を始める / やめる（F-MODE-05）。
 *
 * **エディタの実体を外へ渡さないための包み。** 同期の中身は `features/view/scroll-sync.ts`
 * （`main` チャンク）にあり、そちらが知っているのは **行番号だけの窓口**
 * （`EditorScrollPort`）である。座標計算は `scroll-port.ts` にあり、
 * 実体を渡せるのはここだけなので、ここが橋渡しをする。
 */
export function setSplitSync(on: boolean): void {
  if (!on) {
    stopScrollSync();
    return;
  }
  if (editor) startScrollSync(createScrollPort(editor));
}
