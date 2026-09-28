/** 設定画面だけが使う英語の文言。キーの構成は `ja/settings.ts` に合わせる。 */
import type { SettingsMessages } from '../types';

export const enSettings = {
  title: 'Settings',
  close: 'Close Settings',
  readOnly: 'Changes cannot be saved because settings.json could not be read. Fix the file and reopen Settings',

  categories: {
    application: 'Application',
    preview: 'Preview',
    editor: 'Editor',
    markdown: 'Syntax',
    explorer: 'Explorer',
    outline: 'Outline',
  },

  sections: {
    font: 'Font',
    display: 'Display',
    input: 'Input and Navigation',
  },

  theme: 'Appearance',
  themeSystem: 'System',
  themeLight: 'Light',
  themeDark: 'Dark',
  themeHint:
    'Switches between light and dark. Choose the colors in Color Theme, separately for the preview and the editor.',

  language: {
    label: 'Display Language',
    description:
      'The language of the app. Automatic follows the display language of the OS. Takes effect after you quit and reopen the app.',
    options: {
      auto: 'Automatic',
      ja: '日本語',
      en: 'English',
    },
  },

  palette: 'Color Theme',
  paletteHint: 'Choose from 50 built-in themes and the CSS files in the themes folder.',
  paletteDefault: 'Marxdown',
  paletteGroups: {
    user: 'Added Themes',
    both: 'Light and Dark',
    light: 'Light',
    dark: 'Dark',
  },
  paletteMissing: (id: string) => `${id} (not found)`,
  openThemes: 'Open themes Folder',

  fontFamily: 'Text Font',
  codeFontFamily: 'Code Font',
  fontFamilyHint: 'The name of an installed font. If the font is not found, the default font is used.',
  fontFamilyPlaceholder: 'Default font',
  fontSize: { label: 'Font Size', description: 'The size of the text, in px.' },
  lineHeight: {
    label: 'Line Height',
    description: 'The height of a line, as a multiple of the font size.',
  },
  maxWidth: {
    label: 'Text Width',
    description: 'The maximum number of characters on a line, counted in half-width characters.',
  },
  softBreak: {
    label: 'Keep Line Breaks in Paragraphs',
    description:
      'Shows line breaks inside a paragraph as they are. When off, lines are joined until a blank line separates them.',
  },
  tableStyle: {
    label: 'Table Borders',
    description:
      'How table borders are drawn. For tables with many columns, a grid or stripes make rows easier to follow.',
    options: {
      lines: 'Horizontal Lines Only',
      grid: 'Grid',
      zebra: 'Stripes',
    },
  },

  markdown: {
    abbreviations: {
      label: 'Abbreviations',
      description: 'Shows the definition of terms defined as "*[HTML]: HyperText Markup Language".',
    },
    definitionLists: {
      label: 'Definition Lists',
      description: 'Shows a term followed by a line starting with ": " as a definition list.',
    },
    insertions: { label: 'Insertions', description: 'Shows "++text++" as inserted text, underlined.' },
    marks: { label: 'Highlights', description: 'Shows "==text==" as if marked with a highlighter.' },
    multilineTables: {
      label: 'Multiline Tables',
      description: 'Enables a table syntax that allows line breaks inside cells.',
    },
    subscript: { label: 'Subscript', description: 'Shows the "2" in "H~2~O" as subscript.' },
    superscript: { label: 'Superscript', description: 'Shows the "2" in "x^2^" as superscript.' },
  },

  editor: {
    fontFamily: 'Font Family',
    fontSize: { label: 'Font Size', description: 'The size of the text, in px.' },
    lineHeight: {
      label: 'Line Height',
      description: 'The height of a line, as a multiple of the font size.',
    },
    letterSpacing: { label: 'Letter Spacing', description: 'The spacing between characters, in px.' },
    fontLigatures: {
      label: 'Font Ligatures',
      description:
        'Shows character sequences such as "->" and "!=" as a single symbol. Works only with fonts that support it.',
    },
    lineNumbers: 'Line Numbers',
    lineNumbersOptions: {
      off: 'Off',
      on: 'On',
      relative: 'Relative to Cursor',
      interval: 'Every 10 Lines',
    },
    renderWhitespace: 'Whitespace',
    renderWhitespaceOptions: {
      none: 'None',
      boundary: 'Except Between Words',
      selection: 'In Selection Only',
      trailing: 'Trailing Only',
      all: 'All',
    },
    renderControlCharacters: { label: 'Control Characters', description: 'Shows control characters as symbols.' },
    renderLineHighlight: 'Current Line Highlight',
    renderLineHighlightOptions: {
      none: 'None',
      gutter: 'Line Number Only',
      line: 'Whole Line',
      all: 'Both',
    },
    guidesIndentation: { label: 'Indentation Guides', description: 'Shows vertical lines at indentation levels.' },
    bracketPairColorization: {
      label: 'Bracket Pair Colorization',
      description: 'Colors matching brackets by pair.',
    },
    minimap: {
      label: 'Minimap',
      description: 'Shows a zoomed-out view of the whole document on the right edge of the editor.',
    },
    stickyScroll: {
      label: 'Sticky Headings',
      description: 'While scrolling, keeps the heading of the current section at the top of the editor.',
    },
    rulers: {
      label: 'Rulers',
      description:
        'Draws vertical lines at the given columns. Separate multiple columns with commas. The color of each line can be set in settings.json.',
      placeholder: 'e.g. 80, 100',
    },
    paddingTop: {
      label: 'Top Padding',
      description: 'The space between the top of the editor and the first line, in px.',
    },

    wordWrap: 'Word Wrap',
    wordWrapOptions: {
      off: 'Off',
      on: 'At Window Width',
      wordWrapColumn: 'At Column',
      bounded: 'At Window Width or Column, Whichever Is Narrower',
    },
    wordWrapColumn: {
      label: 'Wrap Column',
      description: 'The column to wrap at, counted in half-width characters.',
    },
    wordWrapIndicator: {
      label: 'Wrap Indicator',
      description: 'Shows a symbol at the end of wrapped lines to tell them apart from real line breaks.',
    },
    tabSize: { label: 'Tab Size', description: 'The width of a tab, in spaces.' },
    insertSpaces: {
      label: 'Insert Spaces for Tab',
      description: 'Inserts spaces instead of a tab character when you press Tab.',
    },
    wordSeparators: {
      label: 'Word Separators',
      description: 'Characters treated as word boundaries when moving by word, such as with Ctrl+← and Ctrl+→.',
    },
    wordSegmenterLocales: {
      label: 'Word Segmentation Languages',
      description:
        'Languages used to find word boundaries in text without spaces between words, such as Japanese. Used when moving by word and when selecting with a double-click. Separate multiple languages with commas. When empty, only the word separators are used.',
      placeholder: 'e.g. ja, zh-CN',
    },
    cursorStyle: 'Cursor Style',
    cursorStyleOptions: {
      line: 'Line',
      block: 'Block',
      underline: 'Underline',
      'line-thin': 'Thin Line',
      'block-outline': 'Block Outline',
      'underline-thin': 'Thin Underline',
    },
    cursorBlinking: 'Cursor Blinking',
    cursorBlinkingOptions: {
      blink: 'Blink',
      smooth: 'Smooth',
      phase: 'Fade',
      expand: 'Expand',
      solid: 'Solid',
    },
    cursorSurroundingLines: {
      label: 'Cursor Surrounding Lines',
      description: 'The minimum number of lines kept visible above and below the cursor when scrolling.',
    },
    scrollBeyondLastLine: {
      label: 'Scroll Beyond Last Line',
      description: 'Allows scrolling until the last line reaches the top of the editor.',
    },
  },

  marp: {
    themes: {
      label: 'Marp Themes',
      description:
        'Absolute paths of CSS files or folders with themes that slides can select with theme:. Separate multiple paths with commas.',
      placeholder: 'e.g. C:\\slides\\themes',
    },
  },

  explorer: {
    exclude: {
      label: 'Excluded Paths',
      description:
        'Glob patterns (with wildcards such as *) for paths hidden from the Explorer and Go to File. Separate multiple patterns with commas. A pattern without / matches the name at any level. Hidden files and node_modules are always hidden.',
      placeholder: 'e.g. dist, *.tmp, docs/generated',
    },
    temporaryTab: {
      label: 'Open Clicked Files in a Temporary Tab',
      description:
        'A temporary tab shows its name in italics and is replaced when you click another file. It becomes a regular tab when you edit it or double-click it.',
    },
  },

  outline: {
    maxDepth: {
      label: 'Heading Levels',
      description: 'The deepest heading level shown in the Outline, from 1 to 6. Deeper headings are not shown.',
    },
  },

  update: {
    autoCheck: {
      label: 'Check for Updates Automatically',
      description: 'Checks at startup and when the window comes to the front, at most once a day.',
    },
  },

  window: {
    closeToTray: {
      label: 'Keep Running in the Tray on Close',
      description: 'Closing the window keeps the app running in the system tray, so it opens instantly the next time.',
    },
    launchAtLogin: {
      label: 'Start in the Tray at Login',
      description:
        'Makes even the first launch of the day instant. Works only when Keep Running in the Tray on Close is on.',
    },
  },

  sampleHeading: 'Heading',
  sampleBody: 'Sample of text and code',
  sampleList: 'List item',

  defaultValue: (value: boolean) => ` (Default: ${value ? 'On' : 'Off'})`,
  reset: 'Reset to Default',
  resetOf: (label: string) => `Reset ${label} to default`,
  edit: 'Open settings.json',
} satisfies SettingsMessages;
