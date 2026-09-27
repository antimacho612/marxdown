//! コマンド境界のエラー型。
//!
//! 種別はフロントエンドが分岐できる最小限に留める。
//! ユーザー向けの文言は TypeScript 側（`src/i18n/ja.ts`）が作る。

use serde::Serialize;

/// フロントへ返すエラー。
/// `kind` で分岐し、`message` は開発者向けの詳細。
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("ファイルが見つからない: {0}")]
    NotFound(String),

    #[error("アクセスが拒否された: {0}")]
    PermissionDenied(String),

    #[error("許可されたディレクトリの外を参照している: {0}")]
    OutOfScope(String),

    #[error("ファイルが大きすぎる: {path} ({size} bytes)")]
    TooLarge { path: String, size: u64 },

    /// テキストとして解釈できないファイル。
    ///
    /// [`Self::TooLarge`] とは対処が違うため分ける。
    /// こちらは OS の既定アプリで開ける。
    #[error("テキストとして読めない: {0}")]
    Binary(String),

    #[error("外部で変更されている（保存の衝突）")]
    Conflict,

    /// 作成・リネーム・移動の宛先に同じ名前がある（`fsops.rs`）。
    ///
    /// 上書きはしない。置き換えは元に戻せないためである（ADR-0020 §3.2）。
    #[error("同じ名前が既にある: {0}")]
    AlreadyExists(String),

    #[error("不正な引数: {0}")]
    InvalidArgument(String),

    /// `settings.json` を読めていない状態での書き戻しを拒む。
    ///
    /// これを「保存できなかった」一般の I/O エラーと混ぜてはいけない。
    /// ユーザーが手で直している最中であり、UI が出すべき文言も対処も違う。
    #[error("settings.json を読めていないため書き戻せない: {0}")]
    SettingsBroken(String),

    #[error("入出力エラー: {0}")]
    Io(String),
}

impl CoreError {
    /// 検証済みの解決先。
    /// 画像のプレースホルダに実際のパスを出すために使う。
    ///
    /// [`Self::OutOfScope`] だけが持つ。
    /// `message` から切り出すと、文言を変えたときに取り出せなくなる。
    /// symlink を解決した後のパスであり、ドキュメントに書かれた文字列ではない。
    /// 何を許可しようとしているのかを示すには、解決後のパスでなければならない。
    pub fn path(&self) -> Option<&str> {
        match self {
            Self::OutOfScope(path) => Some(path),
            _ => None,
        }
    }

    /// フロントエンドが `switch` で分岐するための安定した識別子。
    pub fn kind(&self) -> &'static str {
        match self {
            Self::NotFound(_) => "not-found",
            Self::PermissionDenied(_) => "permission-denied",
            Self::OutOfScope(_) => "out-of-scope",
            Self::TooLarge { .. } => "too-large",
            Self::Binary(_) => "binary",
            Self::Conflict => "conflict",
            Self::AlreadyExists(_) => "already-exists",
            Self::InvalidArgument(_) => "invalid-argument",
            Self::SettingsBroken(_) => "settings-broken",
            Self::Io(_) => "io",
        }
    }
}

impl From<std::io::Error> for CoreError {
    fn from(e: std::io::Error) -> Self {
        match e.kind() {
            std::io::ErrorKind::NotFound => Self::NotFound(e.to_string()),
            std::io::ErrorKind::PermissionDenied => Self::PermissionDenied(e.to_string()),
            _ => Self::Io(e.to_string()),
        }
    }
}

/// `#[tauri::command]` の `Result` エラー側はシリアライズ可能である必要がある。
/// `{ kind, message }` の形に固定し、フロント側の型（`src/platform/types.ts`）と対応させる。
impl Serialize for CoreError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("CoreError", 3)?;
        s.serialize_field("kind", self.kind())?;
        s.serialize_field("message", &self.to_string())?;
        s.serialize_field("path", &self.path())?;
        s.end()
    }
}

/// コマンド境界の `Result`。
/// エラー側は必ず [`CoreError`] にする。
pub type CoreResult<T> = Result<T, CoreError>;
