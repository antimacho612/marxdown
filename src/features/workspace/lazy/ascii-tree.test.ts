import { describe, expect, it } from 'vitest';

import type { DirTree, TreeNode } from '@/platform';

import { toAsciiTree } from './ascii-tree';

function file(name: string): TreeNode {
  return { name, dir: false, children: [] };
}

function dir(name: string, children: TreeNode[] = []): TreeNode {
  return { name, dir: true, children };
}

function tree(nodes: TreeNode[], name = 'project'): DirTree {
  return { name, nodes, truncated: false };
}

describe('toAsciiTree', () => {
  it('基点を 1 行目に置き、配下を罫線で描く', () => {
    const result = toAsciiTree(tree([dir('docs', [file('a.md')]), file('README.md')]));

    expect(result).toBe(['project/', '├── docs/', '│   └── a.md', '└── README.md'].join('\n'));
  });

  it('末尾の枝の下は縦線を続けない', () => {
    const result = toAsciiTree(tree([dir('docs', [dir('adr', [file('0001.md')]), file('a.md')])]));

    expect(result).toBe(['project/', '└── docs/', '    ├── adr/', '    │   └── 0001.md', '    └── a.md'].join('\n'));
  });

  it('空のディレクトリも 1 行として出す', () => {
    expect(toAsciiTree(tree([dir('assets'), file('a.md')]))).toBe(['project/', '├── assets/', '└── a.md'].join('\n'));
  });

  it('中身が無ければ基点の 1 行だけになる', () => {
    expect(toAsciiTree(tree([]))).toBe('project/');
  });

  it('基点が区切り文字で終わるときは `/` を重ねない', () => {
    expect(toAsciiTree(tree([], 'C:\\'))).toBe('C:\\');
  });
});
