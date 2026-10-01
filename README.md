# snapgen-mcp

Unofficial [Model Context Protocol](https://modelcontextprotocol.io) server for [snapgen.ai](https://snapgen.ai). It talks only to the snapgen API with your own key. No Higgsfield account, no extra subscription in this repo.

Not affiliated with snapgen.ai. API behavior follows [docs.snapgen.ai](https://docs.snapgen.ai). Premium is required on the snapgen side for API access.

## Setup

1. Create a key at https://snapgen.ai/profile/integration/api-keys
2. Node.js 18+

```bash
git clone https://github.com/rmryv/snapgen-mcp.git
cd snapgen-mcp
npm install
```

Claude Desktop / Cursor / Claude Code config:

```json
{
  "mcpServers": {
    "snapgen": {
      "command": "node",
      "args": ["/absolute/path/to/snapgen-mcp/src/index.js"],
      "env": {
        "SNAPGEN_API_KEY": "your-key"
      }
    }
  }
}
```

## Tools

| Tool | Endpoint |
| --- | --- |
| `generate_image` | `POST /uapi/v1/generate_image` (nano-banana-pro, nano-banana-2, nano-banana-2-lite) |
| `generate_gpt_image` | `POST /uapi/v1/imagen/gpt-image-2` |
| `generate_grok_image` | `POST /uapi/v1/imagen/grok` |
| `generate_video` | Veo, Seedance, and family paths under `/uapi/v1/video-gen/{family}` |
| `get_generation` | `GET /uapi/v1/history/{uuid}` |
| `list_generations` | `GET /uapi/v1/histories` |
| `wait_for_generation` | Polls history until status 2 or 3 |
| `snapgen_request` | Any `/uapi/` path, for models not wrapped yet |

Auth header is `x-api-key`. Jobs are async. Status `1` is processing, `2` completed, `3` failed. Download media URLs; snapgen expires results.

Video family paths for minimax, grok, flux, kling, and vela follow the documented `/uapi/v1/video-gen/{family}` pattern. If a family 404s, use `snapgen_request` with the path from the matching docs page.
