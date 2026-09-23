/**
 * E2E が読み書きする対象ファイルの用意と、バイト列の照合。
 *
 * バイト列で比較するのは、N-CMP-03「編集・保存によって、触っていない箇所のバイト列が変化しないこと」が編集機能で最も重い要件だからである（01.requirements/03-non-functional-requirements.md）。
 * 文字列で比べると、CRLF が LF に変わったことも BOM が失われたことも通ってしまうため、ここでは常に `Buffer` を突き合わせる。
 *
 * 作業ファイルは 1 枚に固定し、spec ファイルごとに `beforeSession`（`wdio.conf.ts`）で作り直す。
 * テストはその中身を入れ替えて使う。
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** 作業ディレクトリ。Git 管理外（`.gitignore`）。 */
export const WORK_DIR = path.resolve(here, '..', '.work');

/** E2E が開くファイル。argv 転送で開くため、パスは固定である。 */
export const WORK_DOC = path.join(WORK_DIR, 'doc.md');

export type Eol = 'lf' | 'crlf';

export interface FixtureShape {
  /** LF で書いた本文。`eol` に従って変換してから書き込む。 */
  content: string;
  /** ディスク上の改行コード。既定 `lf`。 */
  eol?: Eol;
  /** UTF-8 BOM を付けるか。既定 false。 */
  bom?: boolean;
}

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/** 指定の姿のバイト列を組み立てる。書き込みと照合で同じ関数を使う。 */
export function toBytes({ content, eol = 'lf', bom = false }: FixtureShape): Buffer {
  const body = eol === 'crlf' ? content.replaceAll('\n', '\r\n') : content;
  const bytes = Buffer.from(body, 'utf8');
  return bom ? Buffer.concat([BOM, bytes]) : bytes;
}

/** 既定の作業ファイル。見出しと段落だけの、最小の Markdown。 */
export const DEFAULT_FIXTURE: FixtureShape = {
  content: '# E2E\n\n本文です。\n',
  eol: 'lf',
  bom: false,
};

/**
 * 作業ディレクトリを作り直す。`beforeSession`（`wdio.conf.ts`）が呼ぶ。
 *
 * 毎回削除して作り直す。
 * 前回の保存結果が残っていると、「保存していないのに一致した」が通ってしまう。
 */
export function resetWorkspace(shape: FixtureShape = DEFAULT_FIXTURE): void {
  rmSync(WORK_DIR, { recursive: true, force: true });
  mkdirSync(WORK_DIR, { recursive: true });
  writeFile(WORK_DOC, shape);
}

/** 指定の姿でファイルを書く。テストが途中で外部変更を起こすときにも使う。 */
export function writeFile(target: string, shape: FixtureShape): void {
  writeFileSync(target, toBytes(shape));
}

/** ディスクの生バイト列。文字列に変換しない。 */
export function readBytes(target: string): Buffer {
  return readFileSync(target);
}
