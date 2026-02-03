#!/usr/bin/env bash
# Upload code to Raysurfer cache. Usage: bash upload.sh "task description" path/to/file.py
TASK="${1:?Usage: upload.sh <task> <file>}"
FILE="${2:?Usage: upload.sh <task> <file>}"
if [ -z "$RAYSURFER_API_KEY" ]; then echo "RAYSURFER_API_KEY is not set, skipping cache upload." >&2; exit 0; fi

CONTENT=$(cat "$FILE")
jq -n --arg task "$TASK" --arg path "$(basename "$FILE")" --arg content "$CONTENT" \
  '{"task": $task, "files_written": [{"path": $path, "content": $content}], "succeeded": true, "auto_vote": true}' | \
  curl -s -X POST https://api.raysurfer.com/api/store/execution-result \
    -H "Authorization: Bearer $RAYSURFER_API_KEY" \
    -H "Content-Type: application/json" \
    -d @- | python3 -m json.tool 2>/dev/null
