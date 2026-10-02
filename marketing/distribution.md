# 配布とコード署名の調査

現在のインストーラーはコード署名をしていないため、初回の実行で SmartScreen の「Windows によって PC が保護されました」が表示される。
「試してみよう」と思った人が最初に見る画面が警告であることは、導線の上で最も大きな離脱の要因になりうる。

README と紹介サイトでは、この事実を隠さずにインストールの節で説明している。
ここでは、署名済みで配布する方法を比べる。

## 選択肢

出典は Microsoft Learn の [Code signing options for Windows app developers](https://learn.microsoft.com/windows/apps/package-and-deploy/code-signing-options) と [SmartScreen reputation](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation)（2026-10-02 時点）。

| 方法 | 費用 | 個人（日本）で使えるか | SmartScreen | 作業 |
| --- | --- | --- | --- | --- |
| Microsoft Store（MSIX） | 無料（Store が署名し直す） | 使える | 警告なし | MSIX を作る必要がある。Tauri の NSIS とは別の経路で、自動更新は Store が担う |
| Microsoft Store（EXE/MSI の提出） | 証明書の費用 | 証明書があれば使える | Store からのインストールは警告なし | 提出する EXE と中の PE ファイルに、Microsoft Trusted Root Program の CA の証明書で署名が必要。サイレントインストールが必須 |
| Azure Artifact Signing（旧 Trusted Signing） | 月 9.99 ドル程度 | **使えない**（個人は米国・カナダのみ） | 評判が貯まるまで警告は出る | CI に組み込みやすい |
| OV 証明書（DigiCert・Sectigo など） | 年 150〜300 ドル程度 | 使える | 評判が貯まるまで警告は出る。ただし発行元の名前が表示され、警告は弱くなる | 秘密鍵は HSM かハードウェアトークンに置く必要がある（2023-06 から） |
| EV 証明書 | 年 400 ドル以上 | 使える | OV と同じ（2024 年から即時の信頼はない） | SmartScreen 目的では勧められていない |
| SignPath Foundation（OSS 向けの無償の署名） | 無料（審査あり） | 審査に通れば使える | OV と同等 | GitHub Actions からの署名に対応。プロジェクトの条件（OSS・ビルドの再現性など）を満たす必要がある。条件は公開前に SignPath の最新の規約で確かめる |

## 推奨

1. **短期: Microsoft Store（MSIX）への掲載を検討する。**
   無料で、利用者は警告を見ない。Store での検索という新しい導線にもなる。
   Tinta はこの経路を推奨のインストール方法にしている。
   課題は、Tauri の updater（`latest.json`）と Store の更新が二重になること。Store 版は updater を無効にしたビルドにする必要がある。
2. **中期: SignPath Foundation に申請する。**
   通れば、GitHub Releases の NSIS インストーラーにも無償で署名できる。
3. **代替: OV 証明書を買う。**
   費用と HSM の管理が必要。SmartScreen の警告は評判が貯まるまで残るが、発行元の名前が出るため、未署名より信頼されやすい。

どの方法でも、署名した版が出るまでは「現在は署名していない」と正直に書き続ける。

## winget

`winget` のマニフェストを [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs) に出すと、`winget install Marxdown` で入れられるようになる。
署名がなくても登録はできる（SmartScreen の扱いは変わらない）。
開発者にとってはブラウザでダウンロードするより手数が少なく、Marxdown の主な利用者に合う。
インストーラーの URL は版ごとの `releases/download/vX.Y.Z/...` を使う。
