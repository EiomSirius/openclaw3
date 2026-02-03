// Upload code to Raysurfer cache. Usage: bun upload.ts "task description" path/to/file.py
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const [task, filepath] = [process.argv[2], process.argv[3]];
if (!task || !filepath) { console.error("Usage: bun upload.ts <task> <file>"); process.exit(1); }

const apiKey = process.env.RAYSURFER_API_KEY;
if (!apiKey) { console.error("RAYSURFER_API_KEY is not set, skipping cache upload."); process.exit(0); }

const content = readFileSync(filepath, "utf-8");
const resp = await fetch("https://api.raysurfer.com/api/store/execution-result", {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({ task, files_written: [{ path: basename(filepath), content }], succeeded: true, auto_vote: true }),
});
console.log(JSON.stringify(await resp.json(), null, 2));
