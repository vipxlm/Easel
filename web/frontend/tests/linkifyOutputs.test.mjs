import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/lib/linkifyOutputs.ts', import.meta.url), 'utf8')
  .replace("import { mediaUrl } from './api';", "const mediaUrl = (p: string) => '/api/media/' + p.split('/').map(encodeURIComponent).join('/');");
const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023}}).outputText;
const {linkifyOutputs} = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
test('local markdown images and file links use the media endpoint', () => {
  for (const path of ['outputs/测试/a.png', '/app/outputs/测试/a.png', 'sandbox:/app/outputs/测试/a.png']) {
    assert.equal(linkifyOutputs(`![图片](${path})`), '![图片](/api/media/%E6%B5%8B%E8%AF%95/a.png)');
  }
  assert.equal(linkifyOutputs('[图片](outputs/a.png)'), '![图片](/api/media/a.png)');
  assert.equal(linkifyOutputs('[下载](outputs/a.pdf)'), '[下载](/api/media/a.pdf)');
});
test('remote URLs, command examples and already converted paths stay intact', () => {
  for (const text of ['![图片](https://example.com/outputs/a.png)', '```sh\ncat outputs/a.png\n```', '`python x.py outputs/a.png`']) assert.equal(linkifyOutputs(text), text);
  const text = linkifyOutputs('outputs/a.png');
  assert.equal(linkifyOutputs(text), text);
});
