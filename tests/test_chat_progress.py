import ast
import json
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
def load_function(path, name, scope):
    tree = ast.parse(path.read_text())
    node = next(n for n in tree.body if getattr(n, 'name', '') == name)
    exec(compile(ast.Module(body=[node], type_ignores=[]), str(path), 'exec'), scope)
    return scope[name]

progress = load_function(ROOT/'web/app.py', '_chat_progress_event', {})
Client = load_function(ROOT/'easel/gateway_questions.py', 'GatewayClient', {'json':json, 'time':time})

def event(run='own', stream='item', **data):
    return {'type':'event','event':'agent','payload':{'runId':run,'stream':stream,'seq':3,'data':data}}

class ProgressTest(unittest.TestCase):
    def test_tool_start_end_and_model_status(self):
        self.assertEqual(progress(event(name='read',toolCallId='t1',status='running'),'own'),
                         ('tool:t1:start','正在执行：读取资料'))
        self.assertEqual(progress(event(name='read',toolCallId='t1',status='completed'),'own'),
                         ('tool:t1:done','已完成：读取资料'))
        self.assertEqual(progress(event(stream='lifecycle',phase='model'),'own'),
                         ('model:3','模型正在分析请求'))

    def test_no_cross_session_or_command_secret_output(self):
        self.assertIsNone(progress(event(run='other',name='exec',status='running'),'own'))
        self.assertIsNone(progress(event(name='exec',status='running'),None))
        data=event(name='exec',status='failed',toolCallId='x',args={'command':'key=SECRET'},title='SECRET',result='SECRET')
        self.assertEqual(progress(data,'own'),('tool:x:error','操作失败：运行处理任务'))
        self.assertIsNone(progress(event(stream='command_output',output='SECRET',status='running'),'own'))

    def test_question_rpc_delivers_agent_events_without_losing_response(self):
        received=[]
        class WS:
            def send(self, msg): self.sent=json.loads(msg)
            def recv(self):return next(self.messages)
        ws=WS();ws.messages=iter([json.dumps(event(name='read',status='running')),
                                 json.dumps({'type':'res','id':'1','ok':True,'payload':{'questions':[]}})])
        c=Client.__new__(Client);c.ws=ws;c._seq=0;c.timeout=1;c.on_event=received.append
        self.assertEqual(c._rpc('question.list',{}),{'questions':[]})
        self.assertEqual(len(received),1)
        self.assertEqual(received[0]['event'],'agent')

if __name__=='__main__':unittest.main()
