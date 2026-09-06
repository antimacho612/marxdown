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
import { attachEditor, getDocumentText, scheduleLiveRender, setDirty } from '@/features/document';
import { settingsStore } from '@/features/settings';
import { attachEditorScrollPort, startScrollSync, stopScrollSync } from '@/features/view';

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
 * `getAlternativeVersionId()` は Undo でその版へ戻ると同じ値に戻るため、本文を文字列で比較しなくても基準と同じ内容かどうかを判定できる。
 */
let cleanVersionId = 0;

/** 本文を LF で読む。モデルが CRLF を保持していても、返すのは LF に正規化した文字列である。 */
function readText(): string {
  return model?.getValue(monaco.editor.EndOfLinePreference.LF) ?? '';
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

  model = monaco.editor.createModel(doc, MARKDOWN_LANGUAGE_ID);
  model.setEOL(monaco.editor.EndOfLineSequence.LF);

  editor = monaco.editor.create(host, {
    model,
    // コンテナのサイズに追随させる（ResizeObserver）。
    // 非表示の間は動作しないため、面を表示し直したときは `relayoutEditor()` で明示的に測り直す。
    automaticLayout: true,

    // 見た目と編集の挙動は設定から来る（`options.ts` / F-CONF-04）。
    // 折り返し・行番号・タブ幅・フォント・カーソルなどはすべてそちらにある。
    ...editorOptions(settingsStore.values),

    /*
     * ここから下は設定項目にしないと決めたものである。理由は 3 つに分かれる。
     * 追加するときは `options.ts` の冒頭を読むこと。
     */

    // 概要ルーラは表示しない。
    // Markdown では表示する情報がほとんど無く、表示すると本文の幅がそのぶん狭くなる（ADR-0001 から引き継ぐ判断）。
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

  // マウントした時点の内容がダーティ判定の基準になる（マウント前にダーティにはならない）。
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
  // アプリ側が処理するキーを Monaco から外すのもここで行う（`keymap.ts`）。
  installEditorKeymap(editor);
  // 選択範囲への URL 貼り付け（F-EDIT-12）。
  installUrlPaste(editor);
  // カーソル位置をステータスバーへ通知する（03.ux-spec/07-status-and-notifications.md §3）。更新は rAF で間引く（`cursor.ts`）。
  installCursorReport(editor);

  // 行番号だけを扱うインタフェースを渡す（`features/view/scroll-sync.ts`）。
  // Split に入る前から渡しておく。
  // アウトラインからのジャンプは Edit でも動作する必要があり、そこで必要になるのは同期ではなくこのインタフェースそのものである（#59）。
  attachEditorScrollPort(createScrollPort(editor));

  // ここから先、本文の真実は Monaco のモデルにある（ADR-0005）。
  attachEditor({
    read: () => (model ? readText() : doc),
    replace: (text) => {
      const current = model;
      if (!current) return;
      // Undo の履歴に残す。`setValue` にすると履歴が失われる。
      current.pushEditOperations(null, [{ range: current.getFullModelRange(), text }], () => null);
    },
    sync: () => {
      cleanVersionId = model?.getAlternativeVersionId() ?? 0;
    },
  });

  return editor;
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
 * 器の大きさを測り直す（`features/mode/mode.ts` が面を出したときに呼ぶ）。
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
