import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t as processStream } from '/usr/local/lib/node_modules/openclaw/node_modules/@openclaw/ai/dist/openai-completions-stream-CDCuw3DP.mjs';
const model = {id: 'deepseek-v4.1-flash', provider: 'opencode', api: 'openai-completions', cost: {input:0, output:0, cacheRead:0, cacheWrite:0}};
async function run(deltas, checkBeforeEnd) {
  const events=[];
  async function* chunks() {
    for(const delta of deltas) yield {choices:[{delta}]};
    checkBeforeEnd?.(events);
    yield {choices:[{delta:{},finish_reason:'stop'}]};
  }
  const output={role:'assistant', content:[], stopReason:'stop'};
  await processStream(chunks(), output, model, {push(e){events.push(e);}}, {emitReasoning:false, strictReasoningTags:true});
  return events.filter(e=>e.type==='text_delta').map(e=>e.delta).join('');
}
test('separate reasoning does not delay visible text until finish', async()=>{
  const text=await run([{reasoning_content:'PRIVATE_THOUGHT'},{content:'你好'},{content:'世界'}], events=>{
    assert.ok(events.some(e=>e.type==='text_delta'), '正文必须在 finish_reason 之前发出');
  });
  assert.equal(text,'你好世界');
});
test('reasoning tags split across content chunks remain hidden', async()=>{
  const text=await run([{content:'<thi'},{content:'nk>PRIVATE_THOUGHT</think>公开正文'}]);
  assert.equal(text,'公开正文');
  assert.ok(!text.includes('PRIVATE_THOUGHT'));
});
