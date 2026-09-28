## Installation

> [!NOTE]
> Currently only the **Windows 10 / 11 (x64)** version is available.

1. Download `Marxdown_<version>_x64-setup.exe` from [Releases](https://github.com/antimacho612/marxdown/releases/latest)
2. Run the downloaded file. No administrator rights are needed (it installs to `%LOCALAPPDATA%\Marxdown`)
3. When asked “Make the marxdown command available from the terminal?” at the end, choose **“Yes”**

`.md` / `.markdown` files are associated with Marxdown, so you can also open them by double-clicking in File Explorer.
Right-click a folder and choose “Open with Marxdown” to open the whole folder (on Windows 11, it is under “Show more options”).

### If SmartScreen shows a warning

The installer is not code-signed, so “Windows protected your PC” appears the first time you run it.
Choose “More info” and then “Run anyway” to continue the installation.

### WebView2 Runtime

It comes with Windows 11.
On systems without it (some Windows 10 systems), the installer downloads it automatically, so an internet connection is required.

### Silent installation

`/S` installs without prompts.
Add `/ADDTOPATH` to also add Marxdown to PATH.
Updates keep your previous choice.

```powershell
.\Marxdown_<version>_x64-setup.exe /S /ADDTOPATH
```

## Opening from the command line

```bash
marxdown README.md                 # Open a file
marxdown README.md CHANGELOG.md    # Open several files at once
marxdown docs/                     # Open a folder
marxdown -m split notes.md         # Open in a view mode: preview | edit | split
llm "Draft a design" | marxdown -  # Open standard input as an untitled document
```

Whether you run it from cmd.exe, PowerShell, or Git Bash, the prompt comes back right away.
From the second time on, files open as tabs in the running window.

| Option | Description |
| --- | --- |
| `-m`, `--mode <mode>` | Open in the given view mode: `preview` / `edit` / `split` |
| `--background` | Start in the system tray without showing a window |
| `-` | Open standard input as an untitled document |
| `-h`, `--help` | Show the help |
| `-V`, `--version` | Show the version |

A document opened from standard input is not saved as a file yet.
To keep it, save it with <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> (Save As).

> [!WARNING]
> When piping from Windows PowerShell 5.1, non-ASCII characters are replaced with `?` (this is how PowerShell works).
> This does not happen in PowerShell 7.4 or later.

## View modes

| Mode | What it shows | Key |
| --- | --- | --- |
| Preview | The view for reading. Marxdown starts in this mode | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> switches to Edit |
| Edit | Only the editor | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> switches to Preview |
| Split | The editor and preview side by side, scrolling together | <kbd>Ctrl</kbd>+<kbd>\\</kbd> |

<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> cycles through the three modes.

## Waiting in the system tray

When you close the window with `✕`, Marxdown keeps waiting in the system tray.
That is why the next `marxdown` opens right away.
It uses almost no CPU while waiting.

To quit completely, press <kbd>Ctrl</kbd>+<kbd>Q</kbd> or choose “Quit” from the tray menu.
If you want closing the window to quit the app, turn off “Keep Running in the Tray on Close” in Settings.

## Updates

On startup and when the window comes to the front, Marxdown asks GitHub Releases for a new version, at most once a day.
When there is one, the app shows a notice, and “Update and Restart” replaces it right there.

Only the connection itself (such as your IP address) is sent, and nothing about the files you have open.
You can stop it with “Check for Updates Automatically” in Settings.
Even then, you can check from “Check for Updates” in the Command Palette (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>).

## Where files are kept

| File | Location |
| --- | --- |
| Settings (`settings.json`) | `%APPDATA%\com.antimacho612.marxdown\settings.json` |
| Your color themes | `%APPDATA%\com.antimacho612.marxdown\themes\<name>.css` |
| The app itself | `%LOCALAPPDATA%\Marxdown` |

“Open settings.json” in Settings (<kbd>Ctrl</kbd>+<kbd>,</kbd>) lets you edit the settings file directly.
“Open themes Folder” in Settings opens the folder for color themes.

## Uninstalling

Uninstall Marxdown from “Settings > Apps > Installed apps”.
File associations and PATH are restored.
To also delete your settings and recent file history, check “Delete the application data” on the uninstall screen.

## Getting help

If you find a bug, choose “Help” → “Report Issue” from the menu to create an issue.
It opens with your version and OS already filled in.
Please report vulnerabilities by following [SECURITY.md](https://github.com/antimacho612/marxdown/blob/main/SECURITY.md), not in a public issue.
