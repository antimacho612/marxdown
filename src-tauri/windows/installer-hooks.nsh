; Tauri の NSIS テンプレートに差し込むフック。
;
; NOTE: BOM 付き UTF-8 で保存する。BOM が無いと makensis はシステムのコードページとして読み、日本語の文字列が化ける。
; NOTE: MX_PROGID は tauri.conf.json の `bundle.fileAssociations[].name` と一致させる。テンプレートはこの値を define として公開していない。

!define MX_PROGID "Marxdown.Markdown"
!define MX_APPKEY "Software\Classes\Applications\${MAINBINARYNAME}.exe"

; Tauri の関連付け（APP_ASSOCIATE）は拡張子の既定値を書き換えるだけで、「プログラムから開く」の候補には載せない（F-OS-04）。
; Windows 10 以降は利用者の選択（UserChoice）が優先されるため、別のアプリが既定の環境では候補に載っていないと選べない。
!macro MX_REGISTER_OPEN_WITH EXT
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${MX_PROGID}" ""
  WriteRegStr SHCTX "${MX_APPKEY}\SupportedTypes" ".${EXT}" ""
!macroend

; HACK: APP_ASSOCIATE は現在の既定値を無条件に退避する。
; 上書きインストール（更新を含む）では既定値が既に自分の ProgID なので、元の関連付けの退避値が自分の ProgID で上書きされる。
; その後にアンインストールすると、拡張子が削除済みの ProgID を指したまま残る。
; APP_ASSOCIATE より前に、既定値を退避してあった値へ一度戻しておく。
!macro MX_RESTORE_BACKUP_BEFORE_ASSOCIATE EXT
  ReadRegStr $R0 SHCTX "Software\Classes\.${EXT}" ""
  ${If} $R0 == "${MX_PROGID}"
    ReadRegStr $R1 SHCTX "Software\Classes\.${EXT}" "${MX_PROGID}_backup"
    WriteRegStr SHCTX "Software\Classes\.${EXT}" "" "$R1"
  ${EndIf}
!macroend

; APP_UNASSOCIATE は既定値を退避していた値へ戻すだけで、退避用の値と空の既定値を残す。
; 既定値が自分の ProgID のまま残るのは、上の補正より前のインストーラで上書きインストールした場合である。
; キーごと消すのは値もサブキーも残っていないときに限る。他のアプリが書いた値を消さないため。
!macro MX_UNREGISTER_EXT EXT
  DeleteRegValue SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${MX_PROGID}"
  DeleteRegKey /ifnosubkeys /ifnovalues SHCTX "Software\Classes\.${EXT}\OpenWithProgids"
  DeleteRegValue SHCTX "Software\Classes\.${EXT}" "${MX_PROGID}_backup"
  ReadRegStr $R0 SHCTX "Software\Classes\.${EXT}" ""
  ${If} $R0 == ""
  ${OrIf} $R0 == "${MX_PROGID}"
    DeleteRegValue SHCTX "Software\Classes\.${EXT}" ""
  ${EndIf}
  DeleteRegKey /ifnosubkeys /ifnovalues SHCTX "Software\Classes\.${EXT}"
!macroend

; エクスプローラーのコンテキストメニュー（F-OS-05）。
; 対象はフォルダだけである。.md ファイルは「開く」と「プログラムから開く」で既に開ける。
; Windows 11 では「その他のオプションを確認」の中に出る。新しいメニューに出すにはパッケージ ID が要り、それには署名が要る（ADR-0018）。
; %V はフォルダそのものを右クリックしたときも、フォルダ内の余白を右クリックしたときも、そのフォルダのパスになる。
!macro MX_REGISTER_FOLDER_MENU ROOT
  WriteRegStr SHCTX "Software\Classes\${ROOT}\shell\${MX_PROGID}" "" "Marxdown で開く"
  WriteRegStr SHCTX "Software\Classes\${ROOT}\shell\${MX_PROGID}" "Icon" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
  WriteRegStr SHCTX "Software\Classes\${ROOT}\shell\${MX_PROGID}\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%V$\""
!macroend

; PATH のオプトイン（F-OS-02）。
; 書き換えは marxdown.exe（src/path_env.rs）に任せる。NSIS の文字列は 1024 文字で切り詰められ、長い PATH を壊すため。
; 選択は MANUPRODUCTKEY に残す。更新（/UPDATE）ではアンインストーラもこのキーを消さないため、前回の選択として読める。
; 追加しないと答えたときも解除を呼ぶ。以前のインストールで追加したエントリを残さないため。
; NOTE: サイレントインストール用のフラグを /PATH にしない。テンプレートの ${GetOptions} "/P"（パッシブモード）が前方一致で拾う。
!macro MX_APPLY_PATH_CHOICE
  StrCpy $R0 0
  ${If} $UpdateMode = 1
    ClearErrors
    ReadRegDWORD $R0 SHCTX "${MANUPRODUCTKEY}" "AddToPath"
    ${If} ${Errors}
      StrCpy $R0 0
    ${EndIf}
  ${ElseIf} ${Silent}
  ${OrIf} $PassiveMode = 1
    ClearErrors
    ${GetOptions} $CMDLINE "/ADDTOPATH" $R1
    ${IfNot} ${Errors}
      StrCpy $R0 1
    ${EndIf}
  ${ElseIf} ${Cmd} `MessageBox MB_YESNO|MB_ICONQUESTION "ターミナルから marxdown コマンドを使えるようにしますか？$\r$\n$\r$\nユーザー環境変数 PATH に次のフォルダーを追加します。この後に開いたターミナルから使えます。$\r$\n$\r$\n$INSTDIR\bin" IDYES`
    StrCpy $R0 1
  ${EndIf}
  WriteRegDWORD SHCTX "${MANUPRODUCTKEY}" "AddToPath" $R0

  StrCpy $R1 ""
  ClearErrors
  ${If} $R0 = 1
    ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --add-to-path' $R1
  ${Else}
    ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --remove-from-path' $R1
  ${EndIf}
  ${If} ${Errors}
  ${OrIf} $R1 != 0
    DetailPrint "環境変数 PATH を更新できませんでした（終了コード: $R1）"
    ${IfNot} ${Silent}
      MessageBox MB_OK|MB_ICONEXCLAMATION "環境変数 PATH を更新できませんでした。$\r$\nmarxdown コマンド以外の機能は、このまま使えます。"
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro MX_RESTORE_BACKUP_BEFORE_ASSOCIATE "md"
  !insertmacro MX_RESTORE_BACKUP_BEFORE_ASSOCIATE "markdown"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "${MX_APPKEY}" "FriendlyAppName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "${MX_APPKEY}\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
  !insertmacro MX_REGISTER_OPEN_WITH "md"
  !insertmacro MX_REGISTER_OPEN_WITH "markdown"
  !insertmacro MX_REGISTER_FOLDER_MENU "Directory"
  !insertmacro MX_REGISTER_FOLDER_MENU "Directory\Background"
  !insertmacro UPDATEFILEASSOC
  !insertmacro MX_APPLY_PATH_CHOICE
!macroend

; 本体を消す前に呼ぶ必要がある。PATH の解除は marxdown.exe が行うため。
; 更新のときは解除しない。直後のインストールが前回の選択を引き継ぐ。
; ログイン時の自動起動（ADR-0022）の値も消す。書くのは marxdown.exe（src/autostart.rs）で、設定を読むたびに書き直すため、更新のときは残しておけば次の起動で整う。
!macro NSIS_HOOK_PREUNINSTALL
  ${If} $UpdateMode <> 1
    ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --remove-from-path'
    DeleteRegValue SHCTX "${MANUPRODUCTKEY}" "AddToPath"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Marxdown"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro MX_UNREGISTER_EXT "md"
  !insertmacro MX_UNREGISTER_EXT "markdown"
  DeleteRegKey SHCTX "${MX_APPKEY}"
  DeleteRegKey SHCTX "Software\Classes\Directory\shell\${MX_PROGID}"
  DeleteRegKey SHCTX "Software\Classes\Directory\Background\shell\${MX_PROGID}"
  !insertmacro UPDATEFILEASSOC
!macroend
