/**
 * Marp のスライドを描く（F-VIEW-17 / ADR-0023）。
 *
 * TODO: M9 フェーズ 1 の試作。サニタイズと SVG の枠の組み直しはフェーズ 2 で入れる。
 */
import { Marp } from '@marp-team/marp-core';

let marp: Marp | null = null;

function createMarp(): Marp {
  const instance = new Marp({
    inlineSVG: true,
    // NOTE: ブラウザ用のスクリプトはサニタイズで除去されるため、最初から出力させない。
    script: false,
    // NOTE: 数式とハイライトは既存の遅延チャンクで描く。marp-core 側の実装は vite.config.ts で空のモジュールに差し替えてある。
    math: false,
    // NOTE: twemoji は CDN から画像を読むため使わない（ADR-0023 §2.2）。
    emoji: { shortcode: true, unicode: false },
  });
  instance.highlighter = () => '';
  return instance;
}

/** Marp の文書を HTML とテーマの CSS に変換する。出力はサニタイズしていない。 */
export function renderMarp(text: string): { html: string; css: string } {
  marp ??= createMarp();
  const { html, css } = marp.render(text);
  return { html, css };
}
