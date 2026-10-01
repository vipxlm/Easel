import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const script=readFileSync(new URL('../index.html',import.meta.url),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
test('theme is restored before paint, with system fallback and private storage support',()=>{
 for(const [saved,system,expected] of [['light',true,'light'],['dark',false,'dark'],[null,true,'dark'],['invalid',false,'light'],['throws',true,'dark']]) {
  const document={documentElement:{dataset:{},style:{}}};
  runInNewContext(script,{document,localStorage:{getItem(){if(saved==='throws')throw Error('private');return saved;}},matchMedia:()=>({matches:system})});
  assert.equal(document.documentElement.dataset.theme,expected);
  assert.equal(document.documentElement.style.colorScheme,expected);
 }
});
