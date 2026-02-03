#!/usr/bin/env bash
# Search Raysurfer cache. Usage: bash search.sh "task description"
if [ -z "$RAYSURFER_API_KEY" ]; then echo "RAYSURFER_API_KEY is not set, skipping cache search." >&2; exit 0; fi

TASK="${1:-Parse a CSV file and generate a bar chart}"
jq -n --arg task "$TASK" '{"task": $task, "top_k": 5, "min_verdict_score": 0.3}' | \
  curl -s -X POST https://api.raysurfer.com/api/retrieve/search \
    -H "Authorization: Bearer $RAYSURFER_API_KEY" \
    -H "Content-Type: application/json" \
    -d @- | python3 -m json.tool 2>/dev/null
