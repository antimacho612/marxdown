<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg" />
  <img src="assets/logo-light.svg" alt="Marxdown" width="320" />
</picture>

### The app for reading and writing Markdown.

A light and beautiful Markdown viewer & editor that shows your file the moment you type `marxdown README.md` in a terminal.

[![CI](https://github.com/antimacho612/marxdown/actions/workflows/ci.yml/badge.svg)](https://github.com/antimacho612/marxdown/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/antimacho612/marxdown?include_prereleases&sort=semver)](https://github.com/antimacho612/marxdown/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078D4?logo=windows&logoColor=white)
<br />
![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)
![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-stable-000000?logo=rust&logoColor=white)

[**Download**](https://github.com/antimacho612/marxdown/releases/latest) ·
[Website](https://antimacho612.github.io/marxdown/en/) ·
[Features](#-features) ·
[Installation](#-installation) ·
[Usage](#-usage) ·
[Contributing](CONTRIBUTING.md)

[日本語](README.md) | English

</div>

<br />

![Split view. Markdown is edited in the editor on the left, and the preview on the right shows a table, code, math, and a Mermaid diagram](assets/screenshot.png)

## 💡 When to use it

Design documents written by an LLM, a repository's README, meeting notes.
You want to "just open and check" a Markdown file dozens of times a day.

You don't need to start an IDE and wait for its workspace and extensions to load every time.
Marxdown is an app for **opening, reading, and making small edits**.

## ✨ Features

### ⚡ Opens instantly

- Built to open in under 600ms the first time, and under 120ms after that
- After it starts, it waits in the system tray, and later `marxdown foo.md` calls open as **tabs** in the existing window
- It uses almost no CPU while waiting

### 📖 A preview made for reading

- Typography with balanced margins, line height, and text width keeps long documents easy to read
- Shows **tables, code (syntax highlighting), math (KaTeX), and diagrams (Mermaid)** as they are
- Supports GitHub alerts (`> [!NOTE]`), task lists, and footnotes. Definition lists, highlights, superscript, subscript, and more can be enabled in Settings
- Jump to headings from the Outline, and find text in the preview
- Documents with `marp: true` are shown as [Marp](https://marp.app/) slides
- Export the document you are viewing as HTML or PDF

### ✍️ Edit right there

- Switch between Preview, Edit, and **Split** (side by side) with a single key
- The editor is Monaco, the same editor as VS Code
- Saving **never changes a single byte you didn't edit**. Line endings, the BOM, and the final newline stay as they were when opened
- When another app changes the file, it reloads automatically

### 🗂️ Open whole folders

- `marxdown docs/` opens the folder with a file list (the Explorer)
- Create, rename, copy, and move files to the Recycle Bin from the file list
- `Ctrl+P` finds Markdown files in the folder by part of their name
- Every action is available from the Command Palette (`Ctrl+Shift+P`)

### 🎨 Make it yours

- Switch between light and dark, or follow the Windows setting
- **50 built-in color themes**, plus your own themes by just adding a CSS file
- Adjust the text and code fonts, font size, line height, and text width in Settings
- The app is available in English and Japanese. By default it follows the display language of Windows

### 🛡️ Open files you didn't write, safely

Marxdown is built on the assumption that you open Markdown you didn't write yourself.
It never runs scripts embedded in a document, and following a link never navigates the app to another page.
Files outside the folder of the opened file are not read unless you allow it.

## 📦 Installation

> [!NOTE]
> Currently only **Windows 10 / 11 (x64)** is available.

1. Download `Marxdown_<version>_x64-setup.exe` from [Releases](https://github.com/antimacho612/marxdown/releases/latest)
2. Run the downloaded file. No administrator rights are needed (it installs to `%LOCALAPPDATA%\Marxdown`)
3. When asked "Make the marxdown command available from the terminal?" at the end, choose **Yes**

`.md` / `.markdown` files are associated with Marxdown, so you can also open them by double-clicking in File Explorer.

When a new version is released, a notification appears in the app.
Click "Update and Restart" to switch to the new version (see the [CHANGELOG](CHANGELOG.md) for what changed).

<details>
<summary>If "Windows protected your PC" appears</summary>

<br />

The installer is not code-signed, so SmartScreen shows a warning the first time you run it.
Choose "More info" and then "Run anyway" to continue the installation.

</details>

<details>
<summary>About the WebView2 Runtime</summary>

<br />

It is included in Windows 11.
On systems without it (some Windows 10 installations), it is downloaded during installation, so an internet connection is required.

</details>

<details>
<summary>Silent installation</summary>

<br />

Add `/ADDTOPATH` to also add the command to PATH.
When updating, the previous choice is kept.

```powershell
.\Marxdown_0.1.1_x64-setup.exe /S /ADDTOPATH
```

</details>

<details>
<summary>About update checks</summary>

<br />

At startup and when the window comes to the front, Marxdown asks GitHub Releases for a new version, at most once a day.
Only the request itself (such as your IP address) is sent. It contains no information about the files you open.
You can turn it off with "Check for Updates Automatically" (`update.autoCheck`) in Settings.
Even when it is off, you can check with "Check for Updates" in the Command Palette (`Ctrl+Shift+P`).

</details>

<details>
<summary>Uninstallation</summary>

<br />

Uninstall Marxdown from "Settings > Apps > Installed apps".
File associations and PATH are restored.
To also delete your settings and recent file history, check "Delete the application data" on the uninstall screen.

</details>

## 🚀 Usage

```bash
marxdown README.md                 # Open a file
marxdown README.md CHANGELOG.md    # Open several files at once
marxdown docs/                     # Open a folder
marxdown -m split notes.md         # Open in a view mode: preview | edit | split
llm "Draft a design" | marxdown -  # Open standard input as an untitled document
marxdown --help
```

The prompt returns immediately whether you run it from cmd.exe, PowerShell, or Git Bash.

A document opened from standard input is not saved as a file yet. To keep it, save it with <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> (Save As).
When piping from Windows PowerShell 5.1, non-ASCII characters are replaced with `?` (this is how PowerShell works). This does not happen in PowerShell 7.4 or later.

You can also right-click a folder in File Explorer and choose "Open with Marxdown" (on Windows 11, it is under "Show more options").

> [!TIP]
> Closing the window with `✕` leaves Marxdown waiting in the system tray.
> That is why the next `marxdown` opens instantly.
> To quit completely, press <kbd>Ctrl</kbd>+<kbd>Q</kbd> or choose "Quit" from the tray menu.

### ⌨️ Main shortcuts

| Keys | Action |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> | Switch between Preview and Edit |
| <kbd>Ctrl</kbd>+<kbd>\</kbd> | Split (editor and preview side by side) |
| <kbd>Ctrl</kbd>+<kbd>P</kbd> | Find and open a file in the folder |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> | Command Palette |
| <kbd>Ctrl</kbd>+<kbd>,</kbd> | Settings |
| <kbd>Ctrl</kbd>+<kbd>Q</kbd> | Quit |

See [Keyboard Shortcuts](docs/keybindings.en.md) for all shortcuts.
The [guide](https://antimacho612.github.io/marxdown/en/guide/) lists the syntax and every setting.

## 🛠️ Contributing

Build steps, checks, measurements, and the code structure are in [CONTRIBUTING.md](CONTRIBUTING.md) (in Japanese).

## 📄 License

[MIT](LICENSE)
