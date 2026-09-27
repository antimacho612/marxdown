/**
 * update feature の公開面（02.architecture/03-layers.md §2 / ADR-0024）。
 *
 * 確認の契機も適用も Rust 側にあり、ここが持つのは通知バーへの表示と 2 つのコマンドの呼び出しだけである。
 *
 * NOTE: 遅延チャンクを持たない。
 * `lazy/` に分けて測ったところ、動的 import の分だけ `main` が 0.03KB 増えた（分けない場合 147.03KB / 分けた場合 147.06KB）。
 * 中身が小さく、読み込みの入口のほうが大きくなるためである。
 */
export { checkForUpdates, installUpdateNotice } from './update';
