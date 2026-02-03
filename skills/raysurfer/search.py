#!/usr/bin/env python3
"""Search Raysurfer cache. Usage: python search.py "task description" """
import json, os, sys, urllib.request

api_key = os.environ.get("RAYSURFER_API_KEY")
if not api_key:
    print("RAYSURFER_API_KEY is not set, skipping cache search.", file=sys.stderr)
    sys.exit(0)

task = sys.argv[1] if len(sys.argv) > 1 else "Parse a CSV file and generate a bar chart"
req = urllib.request.Request(
    "https://api.raysurfer.com/api/retrieve/search",
    data=json.dumps({"task": task, "top_k": 5, "min_verdict_score": 0.3}).encode(),
    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
)
with urllib.request.urlopen(req) as resp:
    print(json.dumps(json.loads(resp.read()), indent=2))
