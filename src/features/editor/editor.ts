/**
 * Monaco の生成と保持（F-EDIT-01 / `editor` チャンク / ADR-0009）。
 *
 * Edit / Split / WYSIWYG は単一のエディター・単一のモデルを共有し、置き場所だけが違う（02.architecture/07-editor-wysiwyg.md §1）。
 * これにより Undo 履歴・カーソル・IME の挙動がモード間で揃う。
 * Preview へ切り替えても `dispose()` しない（Undo 履歴を保持するため / §4）。
 * ただし Monaco は非表示のあいだ寸法を失うので、表示を戻したら `relayoutEditor()` を呼ぶこと。
 * 破棄するのはタブを閉じるとき（M3 / N-PERF-06）のみである。
 *
 * `#mx-editor` は `index.html` にあり Svelte 管理下に無い（`#mx-preview` と同じ理由 / ADR-0005）。
 * Monaco はモデルの EOL を自分で推定するため、明示的に LF を指定して読み書きしないと CRLF が混ざる（N-CMP-03）。
 */
import { setDirty } from '@/features/document/dirty';
import { scheduleLiveRender } from '@/features/document/live';
import { attachEditor, getDocumentText } from '@/features/document/text';
import { settingsStore } from '@/features/settings';
import { attachEditorScrollPort, startScrollSync, stopScrollSync } from '@/features/view/scroll-sync';

import { installCursorReport } from './cursor';
import { installEditorKeymap } from './keymap';
import { MARKDOWN_LANGUAGE_ID, monaco } from './monaco';
import { applyEditorOptions, editorOptions } from './options';
import { installUrlPaste } from './paste';
import { createScrollPort } from './scroll-port';
import { applyEditorTheme, watchEditorTokens } from './theme';
import { watchEditorSettings } from './watch-settings.svelte';

let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let model: monaco.editor.ITextModel | null = null;

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
 * エディターを載せる。**2 回目以降は何もしない。**
 *
 * 初期内容は `getDocumentText()` から取る。`attachEditor` より**前**に読むこと
 * （後にすると、控えを捨てたあとの空文字を読む）。
 */
export function mountEditor(host: HTMLElement): monaco.editor.IStandaloneCodeEditor {
  if (editor) return editor;

  const doc = getDocumentText();

  model = monaco.editor.createModel(doc, MARKDOWN_LANGUAGE_ID);
  model.setEOL(monaco.editor.EndOfLineSequence.LF);

  editor = monaco.editor.create(host, {
    model,
    // 器の大きさに追随させる（ResizeObserver）。**隠れている間は効かない**ので、
    // 面を出し直したときは `relayoutEditor()` で明示的に測り直す。
    automaticLayout: true,

    // 見た目と編集の挙動は設定から来る（`options.ts` / F-CONF-04）。
    // 折り返し・行番号・タブ幅・フォント・カーソルなどはすべてそちらにある。
    ...editorOptions(settingsStore.values),

    /*
     * ここから下は**設定にしないと決めたもの**。理由は 3 つに分かれる。
     * 増やすときは `options.ts` の冒頭を読むこと。
     */

    // 概要ルーラは出さない。Markdown では意味を持つ印がほとんど載らず、
    // 出すと本文の幅がそのぶん狭くなる（ADR-0001 から引き継ぐ判断）。
    overviewRulerLanes: 0,
    overviewRulerBorder: false,
    hideCursorInOverviewRuler: true,
    // 03.ux-spec/09-motion.md の禁則。スクロールに演出を足さない。
    // **設定に出さない**のは、設定から禁則を破れる形にしないため。
    smoothScrolling: false,

    // **触っていない箇所のバイト列を変えない**（N-CMP-03）。
    // 以下はどれも「気を利かせて別の場所を書き換える」機能である。
    // **不変条件の側にあるので、設定項目にしない。**
    detectIndentation: false,
    trimAutoWhitespace: false,
    formatOnPaste: false,
    formatOnType: false,
    autoIndent: 'keep',

    // Markdown に補完は要らない。**editor worker を起こす経路でもある。**
    // Non-goal（IDE）に寄るので設定に出さない。
    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
    wordBasedSuggestions: 'off',
    // 語のハイライトは「選択と同じもの」だけでよい。`occurrencesHighlight` は
    // 言語サービス（DocumentHighlightProvider）を要求するので切る。
    occurrencesHighlight: 'off',
    selectionHighlight: true,
    // 曖昧・不可視文字の警告は、日本語の本文では鳴りっぱなしになる。
    // 点けられる設定を出す価値が無い。
    unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false },
  });

  // 載せた時点の内容がダーティ判定の基準（マウント前はダーティになりようがない）。
  cleanVersionId = model.getAlternativeVersionId();

  // ダーティ状態（F-EDIT-03）。boolean 1 つだけがリアクティビティを通り、本文そのものは通らない（ADR-0005）。
  // `setDirty` は値が変わらなければ何もしない。
  //
  // `editor.onDidChangeModelContent` ではなくモデル側を購読する。
  // エディターの通知は Undo で版を巻き戻す前に飛ぶ「速い」ほうで、それで判定すると Undo で基準まで戻ってもダーティが外れない（#43 の再来。実測で確認済み）。
  model.onDidChangeContent(() => {
    setDirty(model?.getAlternativeVersionId() !== cleanVersionId);
    // Split では右のプレビューを追いかけさせる（F-MODE-03）。
    // 打鍵ごとには描き直さない（`document/live.ts` が待つ）。
    scheduleLiveRender();
  });

  // テーマ（CSS トークン由来）と設定（`settings.json` 由来）は、当て直す先が同じ
  // 1 つのインスタンスなので、入口も 1 つにしておく。
  const instance = editor;
  const refreshAppearance = (): void => {
    applyEditorTheme();
    applyEditorOptions(instance);
  };

  refreshAppearance();
  // 見張るものが 2 つあるのは、変化が 2 系統あるため。
  // トークン（テーマ / プレビューの設定 / 表示倍率）は CSS に現れ、
  // エディターの設定（折り返し・タブ幅など）は現れない。
  watchEditorTokens(refreshAppearance);
  watchEditorSettings(refreshAppearance);

  // Markdown の書式（F-EDIT-08）とリストの継続入力（F-EDIT-09, 10）。
  // **アプリが握るキーを Monaco から剥がすのもここ**（`keymap.ts`）。
  installEditorKeymap(editor);
  // 選択範囲への URL 貼り付け（F-EDIT-12）。
  installUrlPaste(editor);
  // カーソル位置をステータスバーへ（03.ux-spec/07-status-and-notifications.md §3）。**rAF で間引く**（`cursor.ts`）。
  installCursorReport(editor);

  // 行番号だけの窓口を渡す（`features/view/scroll-sync.ts`）。
  // **Split に入る前から渡しておく。** アウトラインからのジャンプは Edit でも
  // 効かなければならず、あれが要求するのは同期ではなく窓口そのものである（#59）。
  attachEditorScrollPort(createScrollPort(editor));

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
 * 検索・置換を閉じる（Split でプレビュー側の検索へ移るとき / `features/view/find.ts`）。
 *
 * **`getAction` では引けない。** 閉じる側は `registerEditorAction` ではなく
 * `registerEditorCommand` で登録されており（`contrib/find/browser/findController.js`）、
 * アクション一覧には出てこない。`trigger` はアクションを見たあと
 * エディターコマンドを見るので、こちらなら引ける。
 *
 * ウィジェットが出ていなければ precondition（`CONTEXT_FIND_WIDGET_VISIBLE`）で
 * 弾かれるので、呼ぶ側が状態を持つ必要はない。
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
 * カーソルを末尾へ置く（`features/bench/input.ts` / **計測専用**）。
 *
 * 打つ場所を決めておかないと、`huge.md` では 1 行目の見出しを延々と伸ばすことになる。
 * **人は自分が見ているところを打つ**ので、そこへ寄せてから始める。
 */
export function moveToEndForBench(): void {
  const current = model;
  if (!editor || !current) return;
  const lineNumber = current.getLineCount();
  editor.setPosition({ lineNumber, column: current.getLineMaxColumn(lineNumber) });
  editor.revealLine(lineNumber);
}

/**
 * Split のスクロール同期を始める / やめる（F-MODE-05）。
 *
 * エディターの実体を外へ渡さないための包みである。
 * 同期の中身（`features/view/scroll-sync.ts`）は行番号だけの窓口（`EditorScrollPort`）しか知らず、座標計算は `scroll-port.ts` にある。
 */
export function setSplitSync(on: boolean): void {
  if (on) startScrollSync();
  else stopScrollSync();
}
