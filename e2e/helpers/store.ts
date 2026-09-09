/**
 * アプリの永続化ストア（`state.json`）を E2E から用意する。
 *
 * **セッション復元（OQ-04）は起動時にしか効かない。** 前回のタブを再現するには、
 * アプリが立ち上がるより前に `state.json` を書いておく必要がある
 * （WebdriverIO では `beforeSession` がその位置になる）。
 *
 * ストアはユーザーの成果物ではなくキャッシュであり、壊れていれば Rust 側が既定値へ戻す。
 * ここで書き換えて差し支えないのはそのためである。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** `tauri.conf.json` から読む。二重管理にしない。 */
function identifier(): string {
  const conf = path.resolve(here, '..', '..', 'src-tauri', 'tauri.conf.json');
  const parsed: unknown = JSON.parse(readFileSync(conf, 'utf8'));
  const value = (parsed as { identifier?: unknown }).identifier;
  if (typeof value !== 'string') throw new TypeError('tauri.conf.json に identifier が無い');
  return value;
}

/** `state.json` の場所（`src-tauri/src/store.rs` の `config_dir`）。 */
export function statePath(): string {
  const base = process.env['APPDATA'];
  if (base === undefined) throw new Error('APPDATA が無い（Windows 以外では動かない）');
  return path.join(base, identifier(), 'state.json');
}

interface StateFile {
  version: number;
  session?: { paths: string[]; active: number };
  [key: string]: unknown;
}

function read(): StateFile {
  const file = statePath();
  if (!existsSync(file)) return { version: 1, recent: [], zoom: 1, window: null };
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as StateFile;
  } catch {
    return { version: 1, recent: [], zoom: 1, window: null };
  }
}

function write(state: StateFile): void {
  const file = statePath();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state), 'utf8');
}

/**
 * 前回のタブを仕込む。**ファイルは実在していること**（Rust 側が読み込み時に落とす）。
 */
export function seedSession(paths: string[], active: number): void {
  write({ ...read(), session: { paths, active } });
}

/**
 * 記録を消す。
 *
 * **他の spec のために必ず呼ぶ。** 復元は引数なしの起動で効くが、E2E のアプリは
 * 引数なしで立ち上がって argv 転送で開く（`helpers/app.ts`）。前の実行の記録が
 * 残っていると、どの spec も 2 枚目のタブを抱えた状態から始まることになる。
 */
export function clearSession(): void {
  write({ ...read(), session: { paths: [], active: 0 } });
}

/** いま記録されているセッション。 */
export function readSession(): { paths: string[]; active: number } {
  return read().session ?? { paths: [], active: 0 };
}
