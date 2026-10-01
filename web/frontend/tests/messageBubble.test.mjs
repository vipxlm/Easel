import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rolldown } from 'rolldown';
import { createRequire } from 'node:module';
import { mkdirSync, rmSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
const cache = new URL('../node_modules/.cache/bubble-test/', import.meta.url);
mkdirSync(cache, { recursive: true });
const outfile = new URL('bubble.cjs', cache).pathname;
const bundle=await rolldown({input:new URL('../src/components/MessageBubble.tsx',import.meta.url).pathname,platform:'node',transform:{jsx:'react-jsx'},external:['react','react/jsx-runtime']});
await bundle.write({file:outfile,format:'cjs'});
await bundle.close();
globalThis.window = {location:{pathname:'/'}};
const loaded = createRequire(import.meta.url)(outfile);
const Bubble = loaded.default || loaded;
rmSync(cache, { recursive: true });
test('attachment-only user message renders image and filename', () => {
 const html=renderToStaticMarkup(createElement(Bubble,{message:{role:'user',content:'',attachments:[{id:'a',name:'产品 图片.jpg',path:'_inbox/session/产品 图片.jpg'}]}}));
 assert.match(html, /<img/); assert.match(html, /\?preview=1/); assert.match(html, /产品 图片.jpg/); assert.match(html, /\/api\/media\/_inbox\/session\//);
});
test('non-image attachments remain visible as file links', () => {
 const html=renderToStaticMarkup(createElement(Bubble,{message:{role:'user',content:'说明',attachments:[{id:'b',name:'资料.pdf',path:'_inbox/session/资料.pdf'}]}}));
 assert.match(html, /资料.pdf/); assert.match(html, /<a /); assert.match(html, /说明/);
});
test('live execution history is collapsed and latest status stays visible', () => {
 const html=renderToStaticMarkup(createElement(Bubble,{message:{role:'assistant',content:''},isStreaming:true,activity:'模型正在分析请求（第 1 轮）\n正在执行：读取资料'}));
 assert.match(html, /正在执行：读取资料/); assert.match(html, /执行记录/); assert.doesNotMatch(html, /<details[^>]*\sopen/);
});
