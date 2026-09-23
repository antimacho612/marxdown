//! 既に別のインスタンスが動いているかを、プラグインを登録する前に調べる（F-OPEN-06）。
//!
//! `-n`（`--new-window`）は「既存プロセスに相乗りせず、独立したプロセスで開く」という指定である。
//! これを成立させるには `tauri-plugin-single-instance` を**登録しない**しかない。
//! 登録すると、そのプラグインの `setup` が argv を転送してプロセスを終了させてしまう（プラグインの Windows 実装）。
//!
//! 一方で、無条件に登録しないのは誤りである。
//! インスタンスが 1 つも無い状態で `-n` を使った場合、そのプロセスは所有者にならない。
//! すると次に `marxdown a.md` を実行したプロセスが所有者になり、以後の argv 転送は**ユーザーが見ていない側**へ届く。
//! そこで「既にいるかどうか」だけを先に調べ、いなければ通常どおり登録して所有者になる。
//!
//! 調べ方はプラグインの実装に合わせる。
//! プラグインは名前付きミューテックス `{identifier}-sim` を作り、`ERROR_ALREADY_EXISTS` で 2 番目だと判定している。
//! こちらは `OpenMutexW` で**作らずに開くだけ**にする。
//! `CreateMutexW` で調べると、その呼び出し自体がミューテックスを作ってしまい、後から登録するプラグインの判定を壊す。
//!
//! 所有者が起動中（ミューテックスは作ったが受け口のウィンドウはまだ無い）の瞬間に当たると「既にいる」と答える。
//! `-n` にとってはそれで正しい。独立したプロセスとして起動するだけである。

/// 既に別のインスタンスが動いているか。
///
/// `identifier` は `tauri.conf.json` の `identifier` をそのまま渡す。
/// Windows 以外では常に `false` を返す。
/// この判定はプラグインの Windows 実装に合わせたものであり、他のプラットフォームでは同じ名前のミューテックスが存在しない。
/// その結果 `-n` は従来どおりの転送になる（`targets` は `nsis` のみで、現状の配布対象は Windows である）。
pub fn is_running(identifier: &str) -> bool {
    #[cfg(windows)]
    {
        windows_impl::is_running(identifier)
    }
    #[cfg(not(windows))]
    {
        let _ = identifier;
        false
    }
}

#[cfg(windows)]
mod windows_impl {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{OpenMutexW, SYNCHRONIZATION_SYNCHRONIZE};

    pub fn is_running(identifier: &str) -> bool {
        // 名前はプラグインが作るものと 1 文字も違ってはいけない（`tauri-plugin-single-instance` の Windows 実装）。
        let name = encode_wide(format!("{identifier}-sim"));

        // 開けたら誰かが持っている。
        // 待機も取得もしない。存在を確かめるだけなので、必要な権限は `SYNCHRONIZE` だけで足りる。
        let opened =
            unsafe { OpenMutexW(SYNCHRONIZATION_SYNCHRONIZE, false, PCWSTR(name.as_ptr())) };

        match opened {
            Ok(handle) => {
                // 開いたままにすると、所有者が終了してもカーネルオブジェクトが残り続ける。
                let _ = unsafe { CloseHandle(handle) };
                true
            }
            Err(_) => false,
        }
    }

    fn encode_wide(value: String) -> Vec<u16> {
        use std::os::windows::ffi::OsStrExt;
        std::ffi::OsStr::new(&value)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }
}
