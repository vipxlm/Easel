"""Exercise the actual native event handler without starting model processes."""
import ast
import json
import unittest
from pathlib import Path

source = Path(__file__).resolve().parents[1] / "web/app.py"
tree = ast.parse(source.read_text())
handler = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == "_handle")
parser = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == "_raw_event_for_run")

class ChatTextStreamTest(unittest.TestCase):
    def handler(self, selected=None):
        state = {"run_id":"own", "text_source":selected, "token_chars":0,
                 "thinking_chars":0, "ignored_foreign_events":0}
        emitted=[]
        scope={"json":json, "run_info":state, "is_http":True, "sk":"test",
               "_openclaw_session_id":lambda _:"session",
               "_emit":lambda kind,text: emitted.append((kind,text))}
        exec(compile(ast.Module(body=[parser,handler],type_ignores=[]),str(source),'exec'), scope)
        return scope["_handle"],state,emitted

    def test_native_deltas_arrive_before_terminal_and_foreign_run_is_ignored(self):
        handle,state,emitted=self.handler()
        for rid,delta in [("foreign","secret"),("own","你好"),("own","世界")]:
            handle(json.dumps({"runId":rid,"event":"assistant_text_stream","evtType":"text_delta","delta":delta}))
        self.assertEqual(emitted,[("token","你好"),("token","世界")])
        self.assertEqual(state["text_source"],"raw")
        self.assertEqual(state["ignored_foreign_events"],1)

    def test_sse_source_wins_without_duplicate_raw_text(self):
        handle,_,emitted=self.handler("sse")
        handle(json.dumps({"runId":"own","event":"assistant_text_stream","evtType":"text_delta","delta":"重复正文"}))
        self.assertEqual(emitted,[])

    def test_raw_without_known_http_run_is_not_claimed(self):
        handle,state,emitted=self.handler()
        state["run_id"]=None
        handle(json.dumps({"runId":"foreign","event":"assistant_text_stream","evtType":"text_delta","delta":"其他会话"}))
        self.assertEqual(emitted,[])
        self.assertIsNone(state["run_id"])

if __name__ == '__main__':
    unittest.main()
