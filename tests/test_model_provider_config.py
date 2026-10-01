"""Provider serialization regressions; run with python -m unittest discover -s tests -p test_model_provider_config.py."""
import ast
import json
import shutil
import tempfile
import unittest
from pathlib import Path


class ProviderConfigTests(unittest.TestCase):
    def test_new_custom_provider_has_required_model_name_and_protocol(self):
        self.check({}, "opencode", "deepseek-v4.1-flash", "openai-completions")

    def test_existing_provider_protocol_and_model_label_are_preserved(self):
        self.check({"api": "openai-responses", "models": [{"id": "old", "name": "Custom label"}]},
                   "opencode", "new-model", "openai-responses", "Custom label")

    def test_anthropic_uses_messages_protocol(self):
        self.check({}, "anthropic", "claude-test", "anthropic-messages")

    def check(self, provider, name, model, expected_api, expected_name=None):
        source = Path(__file__).resolve().parents[1] / "web" / "app.py"
        tree = ast.parse(source.read_text())
        fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "_sync_openclaw_chat")
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "openclaw.json"
            config.write_text(json.dumps({"models": {"providers": {name: provider}}}))
            ns = {"json": json, "shutil": shutil, "Path": Path,
                  "_oc_config_path": lambda: config,
                  "_is_local_gateway_base": lambda base: False,
                  "RESERVED_PROVIDER_KEYS": {"openai", "anthropic", "relay"}}
            exec(compile(ast.Module(body=[fn], type_ignores=[]), str(source), "exec"), ns)
            result = ns["_sync_openclaw_chat"](
                {name: {"model": model, "base": "https://provider.example/v1", "key": "fake-key"}},
                {name}, name + "/" + model)
            self.assertNotIn("失败", result)
            saved = json.loads(config.read_text())
            actual = saved["models"]["providers"][name]
            self.assertEqual(actual["models"][0]["id"], model)
            self.assertEqual(actual["models"][0]["name"], expected_name or model)
            self.assertEqual(actual["api"], expected_api)
            self.assertEqual(saved["agents"]["defaults"]["model"]["primary"], name + "/" + model)
