# Posts for international audiences

All posts share one message:

> Don't open VS Code just to read a Markdown file.
> Marxdown is a fast, reading-first Markdown viewer for Windows. Edit when you need to.

Rules for every post (see [README.md](README.md#投稿で守ること)):
no superlatives, no "better than VS Code / Obsidian", no unmeasured speed comparisons, no asking for stars or downloads, and no selling the fact that AI was used to build it.

Images to attach are in [`assets/`](../assets/). Links:

- Website: <https://antimacho612.github.io/marxdown/en/>
- GitHub: <https://github.com/antimacho612/marxdown>

---

## Post 1 — The VS Code problem

**Theme:** using VS Code as a Markdown viewer.
**Where:** X, Bluesky, Mastodon, LinkedIn.
**Attach:** `assets/screenshots/cli.en.png` (or a short GIF, see [screenshots/README.md](screenshots/README.md)).

```text
I love VS Code.

But I don't want to open a full IDE just to read a Markdown file.

So I built Marxdown: a reading-first Markdown viewer for Windows.

marxdown README.md

It opens in a reading view, with tables, code, math, and Mermaid diagrams rendered. One key switches to an editor (Monaco, the same one VS Code uses) when you need to fix something.

Free and open source (MIT):
https://github.com/antimacho612/marxdown
```

---

## Post 2 — Markdown in the age of AI

**Theme:** AI produces more Markdown than ever.
**Where:** X, Bluesky, LinkedIn.
**Attach:** `assets/screenshots/reading.en.png`.

```text
AI keeps generating Markdown.

Research notes.
Architecture docs.
Meeting summaries.
Plans.

I was spending more time reading Markdown than writing it, and I wanted a fast, comfortable place to read all of it.

That's why I built Marxdown, a reading-first Markdown viewer for Windows.

llm "Draft a design" | marxdown -

https://antimacho612.github.io/marxdown/en/
```

---

## Post 3 — The command line

**Theme:** the whole workflow is one command.
**Where:** X, Bluesky, Mastodon.
**Attach:** `assets/screenshots/cli.en.png`.

```text
This is the entire workflow:

marxdown README.md

No workspace.
No project setup.
No browser tab.

Just open the Markdown and read it. The prompt comes back immediately, and the next file opens as a tab in the same window.

Marxdown, for Windows. Free and open source:
https://github.com/antimacho612/marxdown
```

---

## X thread (optional follow-ups to Post 1)

Post these as replies to Post 1, one per reply, only if the first post gets conversation.

```text
2/ It's for the moments when you don't need a development environment: a README, a design doc, notes an AI just wrote. I use both: VS Code for writing code, Marxdown for reading what's written about it.
```

```text
3/ It's built for Markdown you didn't write yourself. Scripts in a document never run, and files outside the opened folder aren't loaded unless you allow it. No account, no telemetry.
```

```text
4/ Things I'd love feedback on: what gets in your way when you read long Markdown? Typography, navigation, something else?
https://github.com/antimacho612/marxdown/issues
```

---

## Reddit

### Before posting

- Read each subreddit's rules on self-promotion first. Some allow it only on certain days or in a weekly thread, some require a flair, and some forbid it entirely
- Post to **one subreddit at a time**, and adapt the text to that community. Never cross-post the same text to several subreddits at once
- Stay in the thread for the first few hours and answer questions. Upvotes are not the goal; conversations are
- Candidates, in order of fit: r/Markdown, r/software, r/SideProject, r/opensource, r/Windows (check rules — r/Windows is strict about promotion)

### Title

```text
I got tired of opening VS Code just to read Markdown, so I built a dedicated Windows app
```

Alternative for r/Markdown:

```text
A reading-first Markdown viewer for Windows (free, open source) — looking for feedback from people who read a lot of Markdown
```

### Body

```markdown
**The problem**

I read a lot of Markdown: READMEs, design docs, meeting notes, and more and more research and plans that AI tools write for me. For a long time I opened all of it in VS Code. VS Code is great, but starting a full IDE just to read one `.md` file always felt like too much.

**What Marxdown does**

Marxdown is a Markdown viewer for Windows that opens in a reading view first:

- `marxdown README.md` from any terminal (cmd, PowerShell, Git Bash). The prompt comes back immediately
- After the first launch it waits in the system tray, so the next file opens as a tab right away
- Tables, syntax-highlighted code, math (KaTeX), Mermaid diagrams, GitHub alerts, task lists, footnotes
- When you need to fix something, one key switches to Split view with the Monaco editor
- Saving only changes what you changed (line endings and BOM are kept)
- Fonts, line height, text width, and 50 color themes, because long documents deserve good typography

[screenshot]

**How it's different**

It is not trying to replace VS Code, Typora, or Obsidian. VS Code is for code, Typora for writing, Obsidian for building a knowledge base. Marxdown is for opening the file in front of you and reading it.

**Details**

- Free and open source (MIT), Windows 10 / 11
- No account, no telemetry; it only goes online to check for updates (can be turned off) and to load `https://` images in a document
- The installer is currently not code-signed, so SmartScreen will warn you. I'm looking into signing options
- Built with Tauri 2 (Rust) and Svelte

GitHub: https://github.com/antimacho612/marxdown

I'd especially like feedback from people who read Markdown frequently. What slows you down when you read long Markdown files?
```

---

## Hacker News (Show HN), if you decide to post

```text
Show HN: Marxdown – A reading-first Markdown viewer for Windows
```

First comment from the author (post right after submitting):

```text
I built this because I kept opening VS Code just to read Markdown files, mostly design docs and notes that AI tools write for me. Marxdown opens in a reading view, launches from the terminal (`marxdown README.md`), keeps running in the tray so the next file opens as a tab, and switches to a Monaco editor when you need to fix something. It treats documents as untrusted (no script execution, sanitized HTML, a strict CSP, no reads outside the opened folder without permission). Windows only for now; built with Tauri 2 and Svelte. Happy to answer questions about the design.
```
