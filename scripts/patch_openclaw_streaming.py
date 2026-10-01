"""Repair OpenClaw 2026.9.7 buffering after separate native reasoning deltas.

Keep strict parsing when text is already pending (ambiguous mixed reasoning).
Native reasoning received before visible text is already separated from正文;
normal tag parsing still protects reasoning tags in visible content.
Run before starting gateway. Refuse unknown versions/layouts, keep backups.
"""
import json
from pathlib import Path


def patch(root: Path):
    version = json.loads((root / "package.json").read_text())["version"]
    if version != "2026.9.7":
        raise RuntimeError(f"Streaming patch requires review for OpenClaw {version}")
    filename = "node_modules/@openclaw/ai/dist/openai-completions-stream-CDCuw3DP.mjs"
    patches = [
        (filename, "const reasoningTagTextPartitioner = createReasoningTagTextPartitioner();",
         "let reasoningTagTextPartitioner = createReasoningTagTextPartitioner();"),
        (filename,
         "if (forceStrict || reasoningTagTextPartitioner.hasPending()) reasoningTagTextPartitioner.markStrict();",
         """if (reasoningTagTextPartitioner.hasPending()) reasoningTagTextPartitioner.markStrict();
        else if (!output.content.some(block => block.type === "text" && block.text)) {
            reasoningTagTextPartitioner = createReasoningTagTextPartitioner();
        }"""),
    ]
    for filename, old, new in patches:
        path = root / filename
        source = path.read_text()
        if old not in source and new in source:
            continue
        if source.count(old) != 1:
            raise RuntimeError(f"Unknown OpenClaw reasoning stream layout: {filename}")
        backup = path.with_suffix(".mjs.bak-easel-stream")
        if not backup.exists():
            backup.write_text(source)
        path.write_text(source.replace(old, new))



if __name__ == "__main__":
    patch(Path("/usr/local/lib/node_modules/openclaw"))
