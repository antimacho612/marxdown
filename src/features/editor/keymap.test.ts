/**
 * キーマップの取り決めが、パッケージの中身とずれていないか（F-EDIT-04〜07）。
 *
 * # ここでしか気づけないこと
 *
 * `keymap.ts` の `DROPPED` は**文字列で照合している**。パッケージ側の綴りが
 * 変わったら、外したつもりのキーが黙って復活する。`Ctrl+K` が和音のまま残れば
 * Phase 4 のリンク挿入が効かず、`Mod-f` が残れば `Ctrl+F` が二重に開く。
 * **どちらも「動くけれど何かおかしい」**という形で出るので、気づくのが遅れる。
 *
 * 実際にキーを押したときの挙動そのものは E2E の担当（`e2e/specs/edit.e2e.ts`）。
 */
import { vscodeKeymap } from '@replit/codemirror-vscode-keymap';
import { describe, expect, it } from 'vitest';

import { DROPPED_KEYS, withoutDropped } from './keymap';

describe('VS Code 互換キーマップの取捨', () => {
  it('外すと決めたキーは、パッケージ側に実在する', () => {
    const keys = new Set(vscodeKeymap.map((binding) => binding.key));

    for (const key of DROPPED_KEYS) expect([...keys]).toContain(key);
  });

  it('外したキーは残らない', () => {
    const keys = new Set(withoutDropped(vscodeKeymap).map((binding) => binding.key));

    for (const key of DROPPED_KEYS) expect([...keys]).not.toContain(key);
  });

  it('外すのは名指ししたものだけ（1 キー 1 バインド）', () => {
    expect(withoutDropped(vscodeKeymap)).toHaveLength(vscodeKeymap.length - DROPPED_KEYS.length);
  });

  /**
   * **行の複製（F-EDIT-07）は、このパッケージでは Windows に割り当てられていない。**
   *
   * `copyLineUp` / `copyLineDown` が `mac:` しか持っておらず、`key` が無い。
   * `keymap.ts` の `ADDED` はこれを補うためにある。パッケージ側が直したら
   * ここが落ちるので、そのとき二重定義を畳めばよい。
   */
  it('行複製は mac にしか割り当てられていない（だから足している）', () => {
    const copyLine = vscodeKeymap.filter((binding) => binding.mac?.startsWith('Shift-Alt-Arrow') === true);

    expect(copyLine).toHaveLength(2);
    for (const binding of copyLine) expect(binding.key).toBeUndefined();
  });
});
