/**
 * 文字の設定の見本。操作した値を、アプリのプレビューと同じ変数（`--mx-font-size-content` など）に入れる。
 * 右下の settings.json も同じ値で書き換え、既定から変わった行に色を付ける。
 */

const SERIF = "'Yu Mincho', 'YuMincho', 'Hiragino Mincho ProN', 'Noto Serif JP', serif";

interface Values {
  fontSize: number;
  lineHeight: number;
  maxWidth: number;
  tableStyle: string;
  font: string;
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function initTypography(): void {
  const form = document.querySelector<HTMLFormElement>('[data-typography]');
  const preview = document.querySelector<HTMLElement>('.typo__window .mw__preview');
  const json = document.querySelector<HTMLElement>('[data-settings-json]');
  if (!form || !preview || !json) return;

  const range = (name: string) => form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  const checked = (name: string) => form.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? '';
  const defaults = {
    fontSize: Number(range('preview.fontSize')?.dataset['default']),
    lineHeight: Number(range('preview.lineHeight')?.dataset['default']),
    maxWidth: Number(range('preview.maxWidth')?.dataset['default']),
    tableStyle: checked('preview.tableStyle'),
  };

  const read = (): Values => ({
    fontSize: Number(range('preview.fontSize')?.value),
    lineHeight: Number(range('preview.lineHeight')?.value),
    maxWidth: Number(range('preview.maxWidth')?.value),
    tableStyle: checked('preview.tableStyle'),
    font: checked('font'),
  });

  const update = () => {
    const values = read();
    preview.style.setProperty('--mx-font-size-content', `${values.fontSize}px`);
    preview.style.setProperty('--mx-line-height', String(values.lineHeight));
    preview.style.setProperty('--mx-content-width', `${values.maxWidth}ch`);
    if (values.font === 'serif') preview.style.setProperty('--mx-font-content', SERIF);
    else preview.style.removeProperty('--mx-font-content');
    preview.dataset['mxTableStyle'] = values.tableStyle;

    for (const input of form.querySelectorAll<HTMLInputElement>('input[type="range"]')) {
      const min = Number(input.min);
      const max = Number(input.max);
      input.style.setProperty('--fill', `${((Number(input.value) - min) / (max - min)) * 100}%`);
      const output = form.querySelector(`[data-output="${input.name}"]`);
      if (output) output.textContent = `${input.value}${input.dataset['unit'] ?? ''}`;
    }

    const rows: [string, string, boolean][] = [
      ['preview.fontSize', String(values.fontSize), values.fontSize !== defaults.fontSize],
      ['preview.lineHeight', String(values.lineHeight), values.lineHeight !== defaults.lineHeight],
      ['preview.maxWidth', String(values.maxWidth), values.maxWidth !== defaults.maxWidth],
      ['preview.tableStyle', `"${values.tableStyle}"`, values.tableStyle !== defaults.tableStyle],
    ];
    if (values.font === 'serif') rows.push(['preview.fontFamily', '"Yu Mincho"', true]);
    json.innerHTML = `{\n${rows
      .map(([key, value, changed]) => {
        const line = `  "${key}": ${escapeHtml(value)}`;
        return changed ? `<span class="changed">${line}</span>` : line;
      })
      .join(',\n')}\n}`;
  };

  form.addEventListener('input', update);
  // `reset` は値を戻す前に発生する。戻った後の値で描き直す。
  form.addEventListener('reset', () => setTimeout(update, 0));
  update();
}
