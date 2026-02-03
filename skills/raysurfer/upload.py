#!/usr/bin/env python3
"""Upload code to Raysurfer cache. Usage: python upload.py "task description" path/to/file.py"""
import json, os, sys, urllib.request

if len(sys.argv) < 3:
    print("Usage: python upload.py <task> <file>", file=sys.stderr)
    sys.exit(1)

api_key = os.environ.get("RAYSURFER_API_KEY")
if not api_key:
    print("RAYSURFER_API_KEY is not set, skipping cache upload.", file=sys.stderr)
    sys.exit(0)

task, filepath = sys.argv[1], sys.argv[2]
content = open(filepath, encoding="utf-8").read()
req = urllib.request.Request(
    "https://api.raysurfer.com/api/store/execution-result",
    data=json.dumps({
        "task": task,
        "files_written": [{"path": os.path.basename(filepath), "content": content}],
        "succeeded": True,
        "auto_vote": True,
    }).encode(),
    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
)
with urllib.request.urlopen(req) as resp:
    print(json.dumps(json.loads(resp.read()), indent=2))
