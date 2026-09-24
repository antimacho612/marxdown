// @vitest-environment jsdom
/**
 * 設定 → Monaco オプションの写像（`options.ts` / ADR-0012）。
 *
 * Monaco はマウントしない。
 * 検証するのは写像だけであり、`editorOptions` は副作用を持たない関数として分離してある（実際の Monaco は `editor.dom.test.ts` がマウントする）。
 *
 * トークン（`--mx-zoom` / `--mx-font-code`）は `<html>` の style から読むため、テスト側で設定する。`tokens.css` は jsdom に読み込まれない。
 */
import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, type Settings } from '@/platform';

import { editorOptions } from './options';

function withSettings(patch: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

afterEach(() => {
  document.documentElement.removeAttribute('style');
});

describe('editorOptions', () => {
  it('VS Code の綴りをそのまま Monaco へ渡す', () => {
    const options = editorOptions(
      withSettings({
        'editor.wordWrap': 'bounded',
        'editor.wordWrapColumn': 120,
        'editor.lineNumbers': 'relative',
        'editor.renderWhitespace': 'boundary',
        'editor.cursorStyle': 'line-thin',
        'editor.cursorBlinking': 'phase',
        'editor.tabSize': 4,
        'editor.insertSpaces': false,
        'editor.wordSeparators': './\\()"\'',
        'editor.rulers': [80, 100],
      }),
    );

    expect(options.wordWrap).toBe('bounded');
    expect(options.wordWrapColumn).toBe(120);
    expect(options.lineNumbers).toBe('relative');
    expect(options.renderWhitespace).toBe('boundary');
    expect(options.cursorStyle).toBe('line-thin');
    expect(options.cursorBlinking).toBe('phase');
    expect(options.tabSize).toBe(4);
    expect(options.insertSpaces).toBe(false);
    expect(options.wordSeparators).toBe('./\\()"\'');
    expect(options.rulers).toEqual([80, 100]);
  });

  it('色を持つ縦罫線は Monaco の形に写し、色の無いものはテーマの色にする', () => {
    const options = editorOptions(
      withSettings({ 'editor.rulers': [80, { column: 100, color: '#ff000080' }, { column: 120 }] }),
    );

    expect(options.rulers).toEqual([80, { column: 100, color: '#ff000080' }, { column: 120, color: null }]);
  });

  it('入れ子のキーは Monaco 側の入れ子オプションへ移す', () => {
    const options = editorOptions(
      withSettings({
        'editor.guides.indentation': false,
        'editor.minimap.enabled': true,
        'editor.bracketPairColorization.enabled': true,
        'editor.padding.top': 24,
      }),
    );

    expect(options.guides).toEqual({ indentation: false });
    expect(options.minimap).toEqual({ enabled: true });
    expect(options.bracketPairColorization).toEqual({ enabled: true });
    expect(options.padding).toEqual({ top: 24 });
  });

  /**
   * 折り返しを切ったときに、右へはみ出した行へ到達できること。
   * 横スクロールバーは設定項目ではなく、折り返しの従属物として決まる。
   */
  it('折り返しを切ると横スクロールバーが出る', () => {
    expect(editorOptions(withSettings({ 'editor.wordWrap': 'on' })).scrollbar?.horizontal).toBe('hidden');
    expect(editorOptions(withSettings({ 'editor.wordWrap': 'off' })).scrollbar?.horizontal).toBe('auto');
  });

  /**
   * `updateOptions` は `scrollbar` をオブジェクトごと差し替えるため、太さと影がここから漏れると設定を変えた時点で既定値へ戻る。
   */
  it('スクロールバーの太さと影は折り返しの設定に関わらず変わらない', () => {
    for (const wordWrap of ['on', 'off'] as const) {
      const { scrollbar } = editorOptions(withSettings({ 'editor.wordWrap': wordWrap }));

      expect(scrollbar?.verticalScrollbarSize).toBe(10);
      expect(scrollbar?.horizontalScrollbarSize).toBe(10);
      expect(scrollbar?.useShadows).toBe(false);
    }
  });

  /** F-VIEW-11。Monaco の `fontSize` は数値であり CSS の `calc()` を使えないため、ここで掛ける。 */
  it('文字サイズに表示倍率が掛かる', () => {
    document.documentElement.style.setProperty('--mx-zoom', '1.5');

    expect(editorOptions(withSettings({ 'editor.fontSize': 14 })).fontSize).toBe(21);
  });

  it('倍率が未設定なら等倍で扱う', () => {
    expect(editorOptions(withSettings({ 'editor.fontSize': 14 })).fontSize).toBe(14);
  });

  it('フォント名が空ならトークン層のコードフォントに落ちる', () => {
    document.documentElement.style.setProperty('--mx-font-code', '"Cascadia Code", monospace');

    expect(editorOptions(withSettings({ 'editor.fontFamily': '' })).fontFamily).toBe('"Cascadia Code", monospace');
  });

  /**
   * 指定があるときは既定スタックを後ろへ追加する（F-CONF-04）。
   * 置き換えてしまうと、そのフォントに無い文字（日本語 / 記号）のフォールバック先が無くなる。
   */
  it('フォント名を指定すると既定スタックの前に足す', () => {
    document.documentElement.style.setProperty('--mx-font-code-stack', 'Consolas, monospace');

    expect(editorOptions(withSettings({ 'editor.fontFamily': 'Meiryo UI' })).fontFamily).toBe(
      '"Meiryo UI", Consolas, monospace',
    );
  });

  /** 既定値はプレビューの見た目ではなく、書くための値である（ADR-0012）。 */
  it('既定でプレビューのタイポグラフィを着ない', () => {
    const options = editorOptions(DEFAULT_SETTINGS);

    expect(options.fontSize).toBe(DEFAULT_SETTINGS['editor.fontSize']);
    expect(options.fontSize).not.toBe(DEFAULT_SETTINGS['preview.fontSize']);
    expect(options.lineHeight).not.toBe(DEFAULT_SETTINGS['preview.lineHeight']);
  });
});
