/**
 * 設定 UI で縦罫線の桁を編集したときに、罫線ごとの色を引き継ぐ。
 *
 * 色は settings.json でのみ指定でき、設定 UI には桁だけを出す（VS Code と同じ）。
 * 入力は 1 打鍵ごとに反映されるため、`100` を `10` に打ち直した時点でストアから色付きの項目が消える。
 * 直前のストアだけを見て色を戻すと、`100` を打ち終えても色が戻らない。
 * そのためダイアログを開いている間は、桁ごとに最後に見た項目を覚えておく。
 */
import type { Ruler } from '@/platform';

/** 罫線の桁。書き方（数値かオブジェクトか）に依存しない。 */
export function rulerColumn(ruler: Ruler): number {
  return typeof ruler === 'number' ? ruler : ruler.column;
}

/** 桁ごとの色の記憶。ダイアログ 1 回分の寿命で使う。 */
export interface RulerMemory {
  /**
   * 桁の並びを罫線の並びに戻す。
   *
   * 先に `current`（今のストアの値）で記憶を更新する。
   * 外部エディターで色を変えた・外した場合も、次の入力からはそれに従う。
   * 覚えている桁はその項目をそのまま使い、それ以外は数値のまま返す。
   */
  restore(columns: readonly number[], current: readonly Ruler[]): Ruler[];
  /** 記憶を捨てる。「既定に戻す」の後に同じ桁を入力し直しても、色は付かない。 */
  forget(): void;
}

/** 空の記憶を作る。 */
export function createRulerMemory(): RulerMemory {
  const known = new Map<number, Ruler>();

  return {
    restore(columns, current) {
      for (const ruler of current) {
        if (typeof ruler === 'number') known.delete(ruler);
        else known.set(ruler.column, ruler);
      }
      return columns.map((column) => known.get(column) ?? column);
    },
    forget() {
      known.clear();
    },
  };
}
