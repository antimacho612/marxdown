; Tauri の NSIS テンプレートに差し込むフック（docs/06.roadmap/m6-ship.md / docs/04.tech-stack/09-tauri-config.md §3）。
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

; APP_UNASSOCIATE は既定値を退避していた値へ戻すだけで、退避用の値と空の既定値を残す。
; キーごと消すのは値もサブキーも残っていないときに限る。他のアプリが書いた値を消さないため。
!macro MX_UNREGISTER_EXT EXT
  DeleteRegValue SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${MX_PROGID}"
  DeleteRegKey /ifnosubkeys /ifnovalues SHCTX "Software\Classes\.${EXT}\OpenWithProgids"
  DeleteRegValue SHCTX "Software\Classes\.${EXT}" "${MX_PROGID}_backup"
  ReadRegStr $R0 SHCTX "Software\Classes\.${EXT}" ""
  ${If} $R0 == ""
    DeleteRegValue SHCTX "Software\Classes\.${EXT}" ""
  ${EndIf}
  DeleteRegKey /ifnosubkeys /ifnovalues SHCTX "Software\Classes\.${EXT}"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "${MX_APPKEY}" "FriendlyAppName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "${MX_APPKEY}\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
  !insertmacro MX_REGISTER_OPEN_WITH "md"
  !insertmacro MX_REGISTER_OPEN_WITH "markdown"
  !insertmacro UPDATEFILEASSOC
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro MX_UNREGISTER_EXT "md"
  !insertmacro MX_UNREGISTER_EXT "markdown"
  DeleteRegKey SHCTX "${MX_APPKEY}"
  !insertmacro UPDATEFILEASSOC
!macroend
