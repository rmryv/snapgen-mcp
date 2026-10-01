#!/usr/bin/env node
/**
 * Unofficial MCP server for snapgen.ai.
 * Docs: https://docs.snapgen.ai
 * Auth: x-api-key header. Key from https://snapgen.ai/profile/integration/api-keys
 * Not affiliated with snapgen.ai.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = (process.env.SNAPGEN_BASE_URL || "https://api.snapgen.ai").replace(/\/$/, "");
const API_KEY = process.env.SNAPGEN_API_KEY || "";

const VIDEO_PATHS = {
  veo: "/uapi/v1/video-gen/veo",
  seedance: "/uapi/v1/video-gen/seedance",
  minimax: "/uapi/v1/video-gen/minimax",
  grok: "/uapi/v1/video-gen/grok",
  flux: "/uapi/v1/video-gen/flux",
  kling: "/uapi/v1/video-gen/kling",
  vela: "/uapi/v1/video-gen/vela",
};

function requireKey() {
  if (!API_KEY) {
    throw new Error("SNAPGEN_API_KEY is not set. Create one at https://snapgen.ai/profile/integration/api-keys");
  }
}

function formFrom(fields) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) form.append(key, String(item));
    } else {
      form.append(key, String(value));
    }
  }
  return form;
}

async function snapgen(path, { method = "GET", form, query } = {}) {
  requireKey();
  const url = new URL(BASE + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, {
    method,
    headers: { "x-api-key": API_KEY },
    body: form,
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`snapgen ${method} ${path} -> ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
  return body;
}

function textResult(data) {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}

function mediaFromHistory(item) {
  if (!item || typeof item !== "object") return item;
  const urls = [];
  for (const key of ["generate_result", "media_url", "thumbnail_url", "last_frame_url"]) {
    if (typeof item[key] === "string" && item[key].startsWith("http")) urls.push(item[key]);
  }
  if (Array.isArray(item.thumbnail_urls)) urls.push(...item.thumbnail_urls.filter((u) => typeof u === "string"));
  if (Array.isArray(item.generated_images)) {
    for (const img of item.generated_images) {
      if (img?.url) urls.push(img.url);
      if (img?.image_url) urls.push(img.image_url);
    }
  }
  return {
    uuid: item.uuid,
    status: item.status,
    status_desc: item.status_desc,
    status_percentage: item.status_percentage,
    model_name: item.model_name,
    used_credit: item.used_credit,
    error_message: item.error_message || "",
    urls,
    raw: item,
  };
}

const server = new McpServer({
  name: "snapgen",
  version: "0.1.0",
});

server.tool(
  "generate_image",
  "Generate an image with snapgen nano-banana models. POST /uapi/v1/generate_image. Returns a job; poll with get_generation.",
  {
    prompt: z.string().describe("Image prompt"),
    model: z.enum(["nano-banana-pro", "nano-banana-2", "nano-banana-2-lite"]).default("nano-banana-pro"),
    aspect_ratio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).default("1:1"),
    resolution: z.enum(["1K", "2K", "4K"]).default("1K"),
    style: z.string().optional().describe("e.g. Photorealistic, Anime General, Illustration"),
    file_urls: z.array(z.string()).optional().describe("Public reference image URLs"),
    ref_history: z.string().optional().describe("UUID of a previous snapgen image"),
  },
  async (args) => {
    const body = await snapgen("/uapi/v1/generate_image", { method: "POST", form: formFrom(args) });
    return textResult(body);
  }
);

server.tool(
  "generate_gpt_image",
  "Generate an image with GPT Image 2. POST /uapi/v1/imagen/gpt-image-2. Premium plan required by snapgen.",
  {
    prompt: z.string(),
    mode: z.enum(["low", "medium", "high"]).default("medium"),
    aspect_ratio: z.enum(["1:1", "16:9", "9:16", "4:3"]).default("1:1"),
    resolution: z.string().default("1K").describe("1K, 2K, 4K, up to 12K if the account allows it"),
    background: z.enum(["opaque", "transparent"]).optional(),
    ref_history: z.string().optional(),
    file_urls: z.array(z.string()).optional(),
  },
  async (args) => {
    const body = await snapgen("/uapi/v1/imagen/gpt-image-2", { method: "POST", form: formFrom(args) });
    return textResult(body);
  }
);

server.tool(
  "generate_grok_image",
  "Generate an image with Grok. POST /uapi/v1/imagen/grok.",
  {
    prompt: z.string(),
    orientation: z.enum(["landscape", "portrait", "square"]).default("landscape"),
    num_result: z.number().int().min(1).max(8).default(1),
    mode: z.enum(["SPEED", "QUALITY"]).default("SPEED"),
    ref_history: z.string().optional(),
    file_urls: z.array(z.string()).optional(),
  },
  async (args) => {
    const fields = { ...args };
    if (fields.file_urls) {
      fields.files = fields.file_urls;
      delete fields.file_urls;
    }
    const body = await snapgen("/uapi/v1/imagen/grok", { method: "POST", form: formFrom(fields) });
    return textResult(body);
  }
);

server.tool(
  "generate_video",
  "Submit a video job. family selects the documented path. Returns a uuid to poll with get_generation.",
  {
    prompt: z.string(),
    family: z.enum(["veo", "seedance", "minimax", "grok", "flux", "kling", "vela"]).default("veo"),
    model: z.string().describe("Model id, e.g. veo-3.1-fast, veo-2, seedance-2-omni, sd-2-lower"),
    aspect_ratio: z.string().default("16:9"),
    duration: z.number().int().optional().describe("Seconds, if the model accepts it"),
    resolution: z.string().optional().describe("e.g. 720p, 1080p"),
    mode: z.string().optional().describe("Seedance mode such as fast-vip or pro-vip"),
    file_urls: z.array(z.string()).optional().describe("Reference image URLs, sent as ref_images"),
  },
  async (args) => {
    const path = VIDEO_PATHS[args.family];
    const fields = {
      prompt: args.prompt,
      model: args.model,
      aspect_ratio: args.aspect_ratio,
      duration: args.duration,
      resolution: args.resolution,
      mode: args.mode,
      ref_images: args.file_urls,
    };
    const body = await snapgen(path, { method: "POST", form: formFrom(fields) });
    return textResult({ endpoint: path, job: body });
  }
);

server.tool(
  "get_generation",
  "Fetch one generation by uuid. GET /uapi/v1/history/{uuid}. status 1 processing, 2 completed, 3 failed.",
  { uuid: z.string() },
  async ({ uuid }) => {
    const body = await snapgen(`/uapi/v1/history/${encodeURIComponent(uuid)}`);
    return textResult(mediaFromHistory(body));
  }
);

server.tool(
  "list_generations",
  "List recent generations. GET /uapi/v1/histories.",
  {
    filter_by: z.string().default("all").describe("all, image, video, or the exact type the API expects"),
    page: z.number().int().min(1).default(1),
    items_per_page: z.number().int().min(1).max(50).default(10),
  },
  async (args) => {
    const body = await snapgen("/uapi/v1/histories", { query: args });
    return textResult(body);
  }
);

server.tool(
  "wait_for_generation",
  "Poll a generation until it completes, fails, or the timeout is hit. Does not resubmit the job.",
  {
    uuid: z.string(),
    timeout_seconds: z.number().int().min(5).max(600).default(180),
    interval_seconds: z.number().int().min(2).max(30).default(5),
  },
  async ({ uuid, timeout_seconds, interval_seconds }) => {
    const deadline = Date.now() + timeout_seconds * 1000;
    let last;
    while (Date.now() < deadline) {
      last = await snapgen(`/uapi/v1/history/${encodeURIComponent(uuid)}`);
      const status = last?.status;
      if (status === 2 || status === 3) return textResult(mediaFromHistory(last));
      await new Promise((r) => setTimeout(r, interval_seconds * 1000));
    }
    return textResult({ timed_out: true, ...mediaFromHistory(last) });
  }
);

server.tool(
  "snapgen_request",
  "Call any snapgen path under /uapi. Use when a model ships before this server is updated. path must start with /uapi/.",
  {
    path: z.string().describe("Path beginning with /uapi/, e.g. /uapi/v1/video-gen/veo"),
    method: z.enum(["GET", "POST", "DELETE"]).default("POST"),
    fields: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().describe("Form fields for POST"),
    query: z.record(z.union([z.string(), z.number()])).optional(),
  },
  async ({ path, method, fields, query }) => {
    if (!path.startsWith("/uapi/")) throw new Error("path must start with /uapi/");
    const body = await snapgen(path, {
      method,
      form: method === "POST" && fields ? formFrom(fields) : undefined,
      query,
    });
    return textResult(body);
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
