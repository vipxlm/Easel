import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/lib/linkifyOutputs.ts', import.meta.url), 'utf8')
  .replace("import { mediaUrl } from './api';", "const mediaUrl = (p: string) => '/api/media/' + p.split('/').map(encodeURIComponent).join('/');");
const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023}}).outputText;
const {linkifyOutputs, previewLocalImages, groupChatImages} = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
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

test('native MEDIA markers render every generated card', () => {
  const paths=Array.from({length:6},(_,i)=>`重芝士巴斯克/images/card_${i+1}.png`);
  const message='搞定啦\n\n'+paths.map(p=>`MEDIA:/app/outputs/${p}`).join('\n')+'\n\n标题';
  const rendered=linkifyOutputs(message);
  for(const path of paths) assert.ok(rendered.includes(`](/api/media/${path.split('/').map(encodeURIComponent).join('/')})`));
  assert.ok(!rendered.includes('MEDIA:'));
  assert.equal(linkifyOutputs(rendered),rendered);
});
test('MEDIA conversion preserves external URLs and command examples', () => {
  for(const text of ['MEDIA:https://example.com/outputs/a.png','```sh\nMEDIA:/app/outputs/a.png\n```','`echo MEDIA:/app/outputs/a.png`']) assert.equal(linkifyOutputs(text),text);
});

test('local images load previews and click through to originals', () => {
  const source='<img src="/api/media/项目/图.png" alt="图">';
  const html=previewLocalImages(source);
  assert.ok(html.includes('href="/api/media/项目/图.png"'));
  assert.ok(html.includes('src="/api/media/项目/图.png?preview=1"'));
  assert.ok(html.includes('loading="lazy"'));
  assert.equal(previewLocalImages(html),html);
  const linked=previewLocalImages(`<a href="/api/media/项目/图.png">${source}</a>`);
  assert.equal((linked.match(/<a /g)||[]).length,1);
  assert.ok(linked.includes('?preview=1'));
  for(const unchanged of ['<img src="https://example.com/a.png">','<img src="/api/media/a.svg">']) assert.equal(previewLocalImages(unchanged),unchanged);
});

test('consecutive image paragraphs scroll together without swallowing text or single images', () => {
  const image='<a href="/api/media/a.png"><img src="/api/media/a.png?preview=1"></a>';
  for (const block of [`<p>${image}<br>${image}</p>`, `<p>${image}</p>\n<p>${image}</p>`]) {
    const html=groupChatImages(`<p>正文</p>${block}<p>标题</p>`);
    assert.ok(html.includes('class="chat-image-strip"'));
    assert.ok(html.startsWith('<p>正文</p>'));
    assert.ok(html.endsWith('<p>标题</p>'));
    assert.equal((html.match(/<img /g)||[]).length,2);
    assert.equal(groupChatImages(html),html);
  }
  for (const html of [`<p>${image}</p>`, `<p>正文${image}${image}</p>`]) assert.equal(groupChatImages(html),html);
});
