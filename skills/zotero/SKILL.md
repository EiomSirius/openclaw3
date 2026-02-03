---
name: zotero
description: "Manage academic references and citations using Zotero via pyzotero-cli. Search, list, and organize papers, books, and articles in your library."
homepage: https://www.zotero.org/
metadata: {"openclaw":{"emoji":"📚","requires":{"bins":["zot"]},"install":[{"id":"pip","kind":"pip","package":"pyzotero-cli","bins":["zot"],"label":"Install pyzotero-cli (pip)"},{"id":"uv","kind":"uv","package":"pyzotero-cli","bins":["zot"],"label":"Install pyzotero-cli (uv)"}]}}
---

# Zotero Skill

Manage your academic reference library using the `zot` CLI (pyzotero-cli). Search papers, list collections, manage tags, and organize your research.

## References

- `references/configuration.md` (API setup + local Zotero connection)
- `references/commands.md` (full command reference)

## Prerequisites

1. **Zotero Desktop** installed (https://www.zotero.org/download/)
2. **pyzotero-cli** installed: `pip install pyzotero-cli` or `uv tool install pyzotero-cli`
3. **API credentials** configured (see Configuration below)

## Configuration

### Option 1: Zotero Web API (Recommended)

Get your API key from https://www.zotero.org/settings/keys/new

```bash
# Interactive configuration
zot configure

# Or set environment variables
export ZOTERO_API_KEY="your-api-key"
export ZOTERO_LIBRARY_ID="your-user-id"
export ZOTERO_LIBRARY_TYPE="user"  # or "group"
```

### Option 2: Local Zotero

Enable local API access in Zotero Desktop:
1. Open Zotero > Settings > Advanced > General
2. Enable "Allow other applications on this computer to communicate with Zotero"

```bash
zot configure --local
```

## Quick Start

### List Recent Items

```bash
# List 10 most recent items
zot items list --limit 10

# Output as table
zot items list --output table --limit 10

# Output as JSON
zot items list --output json --limit 20
```

### Search Items

```bash
# Search by title
zot search "machine learning"

# Search with filters
zot items list --filter-item-type journalArticle --limit 20

# Full-text search (requires indexed library)
zot fulltext search "neural network"
```

### Browse Collections

```bash
# List all collections
zot collections list

# List items in a collection
zot collections items <collection-key>

# Create a new collection
zot collections create "My Research Topic"
```

### Manage Tags

```bash
# List all tags
zot tags list

# List items with a specific tag
zot items list --filter-tag "to-read"
```

### Get Item Details

```bash
# Get full item metadata
zot items get <item-key>

# Export citation (BibTeX)
zot items export <item-key> --format bibtex
```

### Attachments

```bash
# List attachments for an item
zot files list <item-key>

# Download attachment
zot files download <attachment-key> --output ~/Downloads/
```

## Conversation Flow

When user asks about references or papers:

1. **Clarify scope**: Ask if they want to search, browse, or add references
2. **Search first**: Use `zot search "query"` or `zot items list --limit N`
3. **Present results**: Show title, authors, year, and item type
4. **Offer actions**: Get details, export citation, list attachments, add tags
5. **Handle collections**: If organizing, list collections and offer to move items

## Common Workflows

### Find Papers on a Topic

```bash
# Search and display as table
zot search "attention mechanism transformer" --output table

# Filter by type
zot items list --filter-item-type journalArticle --filter-tag "deep-learning"
```

### Export Bibliography

```bash
# Export all items in a collection as BibTeX
zot collections export <collection-key> --format bibtex > refs.bib

# Export specific items
zot items export <key1> <key2> --format bibtex
```

### Add New Reference

```bash
# Add from DOI
zot items add --doi "10.1234/example.doi"

# Add from URL
zot items add --url "https://arxiv.org/abs/2301.00000"
```

### Organize with Tags

```bash
# Add tag to item
zot items tag <item-key> --add "important"

# Remove tag
zot items tag <item-key> --remove "to-read"
```

## Output Formats

Most commands support `--output` flag:

| Format | Description |
|--------|-------------|
| `table` | Human-readable table (default) |
| `json` | JSON for programmatic use |
| `bibtex` | BibTeX format (export only) |
| `csv` | CSV format |

## Debugging

```bash
# Check configuration
zot util check-config

# Verify API connection
zot util test-connection

# Enable verbose output
zot --verbose items list
```

## Tips

- Use `--limit` to avoid fetching too many items at once
- Item keys are alphanumeric strings like `ABCD1234`
- Collection keys work the same way
- For group libraries, set `ZOTERO_LIBRARY_TYPE=group` and use group ID
- Full-text search requires Zotero to have indexed your PDFs
- Local mode requires Zotero Desktop to be running

## Guardrails

- Never delete items without explicit user confirmation
- When exporting, confirm the target file path
- For bulk operations, show count and ask for confirmation
- Respect rate limits on Zotero Web API (avoid rapid successive calls)
