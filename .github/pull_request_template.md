<!-- PR は develop に向けてください。機能の追加や挙動の変更は、先に Issue で相談してください（CONTRIBUTING.md「コントリビューション」）。 -->

## 変更の内容

## 関連する Issue

<!-- 例: Closes #123 -->

## 確認したこと

- [ ] `pnpm check` と `pnpm test` が通る
- [ ] Rust を変更した場合、`src-tauri/` で `cargo fmt` / `cargo clippy --all-targets -- -D warnings` / `cargo test` が通る
- [ ] `pnpm size` がバンドル予算の内側に収まる
- [ ] 利用者に見える変更は `CHANGELOG.md` の `## [Unreleased]` に書いた
