import ast
import asyncio
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SOURCE = Path(os.environ.get('EASEL_TEST_APP', Path(__file__).resolve().parents[1] / 'web/app.py'))
node = next(n for n in ast.parse(SOURCE.read_text()).body if isinstance(n, ast.AsyncFunctionDef) and n.name == '_vision_attachment_context')

class VisionTest(unittest.IsolatedAsyncioTestCase):
    async def test_images_use_independent_model_low_and_validate_ownership(self):
        from PIL import Image
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'test.jpg'
            Image.new('RGB', (32, 16), 'red').save(path)
            calls = []
            checked = []
            class Client:
                def __init__(self, **kwargs): self.options = kwargs
                async def __aenter__(self): return self
                async def __aexit__(self, *args): pass
                async def post(self, url, **kwargs):
                    calls.append((url, kwargs, self.options))
                    return SimpleNamespace(status_code=200, json=lambda: {'choices':[{'message':{'content':'红色矩形'}}]})
            ns = {'ChatRequest':object, 'Path':Path, 'asyncio':asyncio,
                  '_attachment_context':lambda req: checked.append(req),
                  '_read_env':lambda: {'EASEL_VISION_MODEL':'gpt-6-luna', 'EASEL_VISION_BASE_URL':'http://test/v1', 'EASEL_VISION_API_KEY':'secret'},
                  '_safe_output_target':lambda p: path}
            exec(compile(ast.Module(body=[node], type_ignores=[]),str(SOURCE),'exec'),ns)
            req = SimpleNamespace(message='描述图片',attachments=[SimpleNamespace(name='test.jpg',path='owned/test.jpg')])
            with patch.dict('sys.modules', {'httpx': SimpleNamespace(AsyncClient=Client)}):
                text = await ns['_vision_attachment_context'](req)
            self.assertEqual(checked,[req])
            self.assertEqual(len(calls),1)
            url,kwargs,options=calls[0]
            self.assertEqual(url,'http://test/v1/chat/completions')
            self.assertEqual(kwargs['json']['model'],'gpt-6-luna')
            self.assertEqual(kwargs['json']['reasoning_effort'],'low')
            self.assertTrue(kwargs['json']['messages'][0]['content'][1]['image_url']['url'].startswith('data:image/jpeg;base64,'))
            self.assertFalse(options['follow_redirects'])
            self.assertIn('红色矩形',text)
            self.assertNotIn('secret',text)
            self.assertNotIn('http://test',text)
            with patch.dict('sys.modules', {'httpx': SimpleNamespace(AsyncClient=Client)}):
                self.assertEqual(await ns['_vision_attachment_context'](SimpleNamespace(attachments=[])), '')
            self.assertEqual(len(calls),1)

    async def test_unconfigured_vision_is_actionable_and_ownership_failure_stops_request(self):
        req=SimpleNamespace(attachments=[SimpleNamespace(name='test.png')])
        ns={'ChatRequest':object,'Path':Path,'_attachment_context':lambda r:None,'_read_env':lambda:{}}
        exec(compile(ast.Module(body=[node],type_ignores=[]),str(SOURCE),'exec'),ns)
        with self.assertRaisesRegex(RuntimeError,'图片分析未配置'):
            await ns['_vision_attachment_context'](req)
        def reject(r): raise ValueError('wrong owner')
        ns['_attachment_context']=reject
        with self.assertRaisesRegex(ValueError,'wrong owner'):
            await ns['_vision_attachment_context'](req)

if __name__=='__main__': unittest.main()
