/**
 * 表示中の文書を HTML / PDF に書き出す（F-VIEW-18 / docs/06.roadmap/m7-cli-os-export.md §4.4）。
 */
import { describeOpenError, documentStore } from '@/features/document';
import { ja } from '@/i18n/ja';
import { dirOf, splitPath } from '@/lib/path';
import { getPlatform } from '@/platform';

import type { ExportFormat } from '..';
import { buildHtml } from './html';
import { printToPdf } from './print';
import { render } from './render';

const SURFACE_SELECTOR = '#mx-preview';

/** 書き出す。結果は通知バーで知らせる。取り消されたら何も出さない。 */
export async function exportDocument(format: ExportFormat): Promise<void> {
  const meta = documentStore.meta;
  const surface = document.querySelector<HTMLElement>(SURFACE_SELECTOR);
  if (!meta || !surface) return;

  try {
    const body = await render({ light: format === 'pdf', baseDir: dirOf(meta.path ?? '') });
    if (!body) return;

    const saved =
      format === 'html'
        ? await getPlatform().exportHtml(await buildHtml({ body, surface, title: titleOf(meta.path) }), meta.path)
        : await printToPdf(body, surface, meta.path);
    if (saved === null) return;

    documentStore.notice = {
      level: 'info',
      message: ja.export.done(saved),
      actions: [{ label: ja.export.reveal, run: () => void getPlatform().revealInFileManager(saved) }],
    };
  } catch (e) {
    documentStore.notice = { level: 'error', message: ja.export.failed(describeOpenError(e, '')) };
  }
}

function titleOf(path: string | null): string {
  return path === null ? ja.titlebar.untitled : splitPath(path).name;
}
