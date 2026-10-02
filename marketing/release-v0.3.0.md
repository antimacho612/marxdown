# v0.3.0 の Release の書き換え案

公開済みの [v0.3.0](https://github.com/antimacho612/marxdown/releases/tag/v0.3.0) の本文とタイトルを、次の内容に差し替える。
v0.3.0 は不具合の修正だけの版なので、価値は「長い文書の表とタスクリストが崩れずに読める」に絞る。

## タイトル

```text
Marxdown v0.3.0 — Cleaner tables and task lists in long documents
```

## 本文

```markdown
Marxdown is a fast, reading-first Markdown viewer for Windows. Edit when you need to.

## What's new

- **Wide tables are centered.** A table wider than the text width used to stick to the left edge of the preview. It is now centered.
- **Task lists wrap naturally.** When a task list item contained a link or other inline content, the checkbox and the text could break onto separate lines. They now stay together.

## Why it matters

Design documents and AI-generated plans are full of comparison tables and to-do lists.
This release makes both read the way you expect, so long documents look as tidy as short ones.

## Download

**Windows 10 / 11 (x64):** [Marxdown_0.3.0_x64-setup.exe](https://github.com/antimacho612/marxdown/releases/download/v0.3.0/Marxdown_0.3.0_x64-setup.exe)

Already installed? Marxdown shows an update notification. Choose "Update and Restart".<br />
インストール済みの場合は、アプリ内の通知から「更新して再起動」で更新できます。

> [!NOTE]
> Windows may show a SmartScreen warning because the installer is currently unsigned. Choose "More info" and then "Run anyway".<br />
> インストーラーには現在コード署名をしていないため、SmartScreen の警告が表示されることがあります。「詳細情報」→「実行」で続けられます。

## 変更内容（日本語）

- プレビューで、タスクリストの項目にリンクなどが含まれるとき、チェックボックスと本文が不自然な位置で折り返されていた不具合を修正した
- プレビューで、本文幅に収まらない表がプレビューの左端に寄っていた不具合を修正した。中央に表示する

## Full changelog

[CHANGELOG.md](https://github.com/antimacho612/marxdown/blob/main/CHANGELOG.md) · [v0.2.0...v0.3.0](https://github.com/antimacho612/marxdown/compare/v0.2.0...v0.3.0)
```

## 次の版から

`release.mjs notes` が「What's new」「Download」「Full changelog」を自動で作る。
CHANGELOG は日本語で書いているため、海外向けには「What's new」の上に英語の要約を 3〜5 項目足すとよい。
