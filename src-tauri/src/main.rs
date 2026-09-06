// NOTE: リリースビルドで余分なコンソールウィンドウが開くのを防ぐ。削除しないこと。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    marxdown_lib::run()
}
