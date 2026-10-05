# キーボードショートカット

日本語 | [English](keybindings.en.md)

Marxdown のショートカットの一覧です。
ここに無い操作も、<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>（コマンドパレット）からすべて実行できます。

## ファイル

| キー | 動作 |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>N</kbd> | 新しいファイル |
| <kbd>Ctrl</kbd>+<kbd>O</kbd> | ファイルを開く |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>O</kbd> | フォルダーを開く |
| <kbd>Ctrl</kbd>+<kbd>S</kbd> | 保存 |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> | 名前を付けて保存 |
| <kbd>F5</kbd> / <kbd>Ctrl</kbd>+<kbd>R</kbd> | ディスク上の最新の内容で開き直す |
| <kbd>Ctrl</kbd>+<kbd>W</kbd> | タブを閉じる |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd> | 閉じたタブを開き直す |
| <kbd>Ctrl</kbd>+<kbd>,</kbd> | 設定 |
| <kbd>Ctrl</kbd>+<kbd>Q</kbd> | Marxdown を終了する |

`✕` でウィンドウを閉じても、Marxdown はタスクトレイで待機しています。
完全に終了するには <kbd>Ctrl</kbd>+<kbd>Q</kbd> を押します。

## 移動

| キー | 動作 |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>P</kbd> | フォルダー内のファイルを名前で検索して開く |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> | コマンドパレット |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd> | 見出しを検索して移動する |
| <kbd>Ctrl</kbd>+<kbd>Tab</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Tab</kbd> | 次 / 前のタブ |
| <kbd>Ctrl</kbd>+<kbd>1</kbd>〜<kbd>9</kbd> | n 番目のタブ |
| <kbd>Alt</kbd>+<kbd>←</kbd> / <kbd>Alt</kbd>+<kbd>→</kbd> | リンクをたどる前 / 後の文書に戻る / 進む |
| <kbd>Ctrl</kbd>+<kbd>G</kbd> | 指定した行へ移動する（Edit / Split のとき） |
| <kbd>Shift</kbd>+クリック | ファイル一覧の項目や相対リンクを、別のウィンドウで開く |

## 表示

| キー | 動作 |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> | Preview と Edit を切り替える |
| <kbd>Ctrl</kbd>+<kbd>\</kbd> | Split（エディターとプレビューを左右に並べる） |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> | 表示モードを順に切り替える |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> | 左のペインを開く / 閉じる |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>B</kbd> | 右のペインを開く / 閉じる |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd> | エクスプローラー（ファイル一覧）を表示する |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>U</kbd> | アウトラインを表示する |
| <kbd>Ctrl</kbd>+<kbd>=</kbd> / <kbd>Ctrl</kbd>+<kbd>-</kbd> / <kbd>Ctrl</kbd>+<kbd>0</kbd> | 拡大 / 縮小 / 元の大きさ |

## 検索

| キー | 動作 |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>F</kbd> | 検索。Split では、フォーカスのある側（エディターかプレビュー）を検索します |
| <kbd>Ctrl</kbd>+<kbd>H</kbd> | 置換（Edit / Split のとき） |
| <kbd>F3</kbd> / <kbd>Shift</kbd>+<kbd>F3</kbd> | 次 / 前の一致へ |

## Markdown の書式（エディター）

| キー | 動作 |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>B</kbd> | 太字 |
| <kbd>Ctrl</kbd>+<kbd>I</kbd> | 斜体 |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> | 取り消し線 |
| <kbd>Ctrl</kbd>+<kbd>`</kbd> | インラインコード |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>`</kbd> | コードブロック |
| <kbd>Ctrl</kbd>+<kbd>K</kbd> | リンクを挿入する（選択した文字列がリンクの文字になります） |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>.</kbd> | 引用 |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> | 箇条書き |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd> | 番号付きリスト |
| <kbd>Ctrl</kbd>+<kbd>Enter</kbd> | タスクリストのチェックを切り替える |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>1</kbd>〜<kbd>6</kbd> | 見出しのレベルを設定する |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>0</kbd> | 見出しを解除する |
| <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> | リストの字下げ / 字上げ。表の中では次 / 前のセルへ移動します |
| <kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>F</kbd> | カーソルのある表の列幅を揃える |

書式のキーは、選択範囲があればその範囲に、無ければカーソルの位置に適用されます。
既に同じ書式が付いている範囲で押すと、書式を外します。

そのほかの編集操作（元に戻す、行の移動、複数カーソルなど）は VS Code と同じです。

## ファイル一覧（エクスプローラーにフォーカスがあるとき）

| キー | 動作 |
| --- | --- |
| <kbd>Enter</kbd> | 開く（フォルダーは展開 / 折りたたみ） |
| <kbd>F2</kbd> | 名前を変更する |
| <kbd>Delete</kbd> | ごみ箱へ移す（確認があります） |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>Ctrl</kbd>+<kbd>X</kbd> / <kbd>Ctrl</kbd>+<kbd>V</kbd> | コピー / 切り取り / 貼り付け |
| <kbd>Escape</kbd> | 切り取りを取り消す / 選択を 1 件に戻す |
| <kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> | 絶対パスをコピーする |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> | 開いたフォルダーからの相対パスをコピーする |
| <kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>R</kbd> | エクスプローラー（Windows）で表示する |
| <kbd>Ctrl</kbd>+<kbd>A</kbd> | 同じ階層の項目をすべて選ぶ |
| <kbd>Shift</kbd>+<kbd>↑</kbd> / <kbd>Shift</kbd>+<kbd>↓</kbd> | 選択範囲を広げる |
| <kbd>Ctrl</kbd>+クリック / <kbd>Shift</kbd>+クリック | 選択に加える / 範囲で選ぶ（2 件以上を選んでいるとき） |
| <kbd>Shift</kbd>+<kbd>F10</kbd> / アプリケーションキー | メニューを開く |
| 文字キー | その文字で始まる次の項目へ移動する |

## macOS（プレビュー）

macOS では <kbd>Ctrl</kbd> を <kbd>⌘</kbd>、<kbd>Alt</kbd> を <kbd>⌥</kbd> と読み替えます。
OS の操作と重なるキーは、次のとおり付け替えています。

| キー | 動作 |
| --- | --- |
| <kbd>⌘</kbd>+<kbd>⌥</kbd>+<kbd>F</kbd> | 置換（<kbd>Ctrl</kbd>+<kbd>H</kbd> の代わり。<kbd>⌘</kbd>+<kbd>H</kbd> は OS の「隠す」） |
| <kbd>⌘</kbd>+<kbd>[</kbd> / <kbd>⌘</kbd>+<kbd>]</kbd> | 戻る / 進む（<kbd>Alt</kbd>+<kbd>←</kbd> / <kbd>Alt</kbd>+<kbd>→</kbd> の代わり。<kbd>⌥</kbd>+<kbd>←</kbd> は単語単位の移動） |
| <kbd>⌃</kbd>+<kbd>Tab</kbd> / <kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>]</kbd> | 次のタブ（<kbd>⌘</kbd>+<kbd>Tab</kbd> は OS のアプリの切り替え） |
| <kbd>⌃</kbd>+<kbd>⇧</kbd>+<kbd>Tab</kbd> / <kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>[</kbd> | 前のタブ |
| <kbd>⌃</kbd>+<kbd>⌘</kbd>+<kbd>F</kbd> | フルスクリーン（OS の機能） |

<kbd>⇧</kbd>+<kbd>⌥</kbd>+<kbd>R</kbd> は Finder で表示します。
