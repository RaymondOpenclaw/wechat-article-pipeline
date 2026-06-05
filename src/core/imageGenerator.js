import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { AiClient } from "./aiClient.js";
import { generateWithAgnesImageSkill } from "./agnesImageSkill.js";
import { ensureDir, slugify } from "../utils/files.js";

export async function generateImages(visualBrief, article, { cwd = process.cwd(), config = {}, aiClient = new AiClient() } = {}) {
  const images = [];
  const dir = path.join(cwd, "generated", "images");
  await ensureDir(dir);
  images.push(await generateOne({
    kind: "cover",
    prompt: visualBrief.coverPrompt,
    filePath: path.join(dir, `${slugify(article.title)}-cover.png`),
    size: config.image?.coverSize || "900x383",
    aiClient
  }));
  for (const [index, prompt] of visualBrief.inlinePrompts.entries()) {
    images.push(await generateOne({
      kind: "inline",
      prompt,
      filePath: path.join(dir, `${slugify(article.title)}-inline-${index + 1}.png`),
      size: "1024x1024",
      aiClient
    }));
  }
  return images;
}

async function generateOne({ kind, prompt, filePath, size, aiClient }) {
  const agnesImagePath = await generateWithAgnesImageSkill({ prompt, outputPath: filePath, size });
  if (agnesImagePath) {
    return { kind, prompt, localPath: filePath, generator: "agnes-image-gen" };
  }
  const imageBuffer = await aiClient.image(prompt, { size });
  if (imageBuffer) {
    await fs.writeFile(filePath, imageBuffer);
    return { kind, prompt, localPath: filePath, generator: "openai-compatible" };
  } else {
    await fs.writeFile(filePath, illustrativePng(kind, prompt));
    return { kind, prompt, localPath: filePath, generator: "local-illustration-fallback" };
  }
}

function illustrativePng(kind, prompt) {
  const width = kind === "cover" ? 900 : 1024;
  const height = kind === "cover" ? 383 : 1024;
  const canvas = createCanvas(width, height, paletteFromPrompt(prompt));
  drawBackground(canvas);
  if (kind === "cover") {
    drawCoverComposition(canvas);
  } else {
    drawInlineComposition(canvas);
  }
  return makePng(width, height, canvas.bytes);
}

function createCanvas(width, height, palette) {
  const bytes = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    bytes[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 4;
      bytes[offset] = palette.paper[0];
      bytes[offset + 1] = palette.paper[1];
      bytes[offset + 2] = palette.paper[2];
      bytes[offset + 3] = 255;
    }
  }
  return { width, height, bytes, palette };
}

function paletteFromPrompt(prompt) {
  const hash = [...String(prompt)].reduce((sum, char) => (sum + char.charCodeAt(0)) % 997, 0);
  const palettes = [
    { paper: [23, 28, 30], ink: [236, 229, 214], accent: [80, 111, 104], warm: [226, 154, 70], soft: [58, 68, 67] },
    { paper: [28, 24, 23], ink: [239, 226, 205], accent: [93, 83, 71], warm: [232, 168, 86], soft: [67, 53, 45] },
    { paper: [19, 25, 31], ink: [232, 223, 210], accent: [71, 103, 119], warm: [214, 139, 71], soft: [48, 61, 70] }
  ];
  return palettes[hash % palettes.length];
}

function drawBackground(canvas) {
  const { width, height, palette } = canvas;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const t = (x / width + y / height) / 2;
      const tint = Math.round(12 * t);
      setPixel(canvas, x, y, [
        clamp(palette.paper[0] - tint),
        clamp(palette.paper[1] - tint),
        clamp(palette.paper[2] - tint)
      ], 255);
    }
  }
}

function drawCoverComposition(canvas) {
  const { width, height, palette } = canvas;
  circle(canvas, width * 0.78, height * 0.24, height * 0.32, palette.warm, 42);
  circle(canvas, width * 0.70, height * 0.34, height * 0.22, palette.warm, 68);
  for (let i = 0; i < 7; i += 1) {
    const stepWidth = width * (0.16 + i * 0.035);
    const stepHeight = height * 0.07;
    const x = width * (0.16 + i * 0.075);
    const y = height * (0.74 - i * 0.07);
    roundedRect(canvas, x, y, stepWidth, stepHeight, 8, i === 4 ? palette.warm : palette.soft, i === 4 ? 220 : 170);
  }
  circle(canvas, width * 0.48, height * 0.42, height * 0.055, palette.ink, 230);
  roundedRect(canvas, width * 0.462, height * 0.48, width * 0.035, height * 0.16, 12, palette.ink, 220);
  drawPath(canvas, [[width * 0.46, height * 0.54], [width * 0.41, height * 0.61]], palette.ink, 8);
  drawPath(canvas, [[width * 0.50, height * 0.54], [width * 0.55, height * 0.62]], palette.ink, 8);
  roundedRect(canvas, width * 0.10, height * 0.20, width * 0.22, height * 0.34, 14, [15, 18, 20], 175);
  drawPath(canvas, [[width * 0.13, height * 0.25], [width * 0.27, height * 0.33]], palette.warm, 3);
}

function drawInlineComposition(canvas) {
  const { width, height, palette } = canvas;
  circle(canvas, width * 0.62, height * 0.25, width * 0.24, palette.warm, 54);
  roundedRect(canvas, width * 0.18, height * 0.60, width * 0.64, height * 0.10, 18, palette.soft, 210);
  roundedRect(canvas, width * 0.34, height * 0.42, width * 0.28, height * 0.16, 14, [18, 20, 22], 230);
  roundedRect(canvas, width * 0.39, height * 0.46, width * 0.18, height * 0.018, 6, palette.warm, 190);
  roundedRect(canvas, width * 0.64, height * 0.34, width * 0.025, height * 0.22, 12, palette.ink, 190);
  circle(canvas, width * 0.665, height * 0.31, width * 0.04, palette.warm, 210);
  for (let i = 0; i < 6; i += 1) {
    const x = width * (0.22 + i * 0.09);
    const y = height * (0.75 - Math.abs(2.5 - i) * 0.025);
    roundedRect(canvas, x, y, width * 0.075, height * 0.035, 9, i === 3 ? palette.warm : palette.accent, i === 3 ? 220 : 170);
  }
  drawPath(canvas, [
    [width * 0.22, height * 0.84],
    [width * 0.34, height * 0.78],
    [width * 0.46, height * 0.83],
    [width * 0.58, height * 0.74],
    [width * 0.72, height * 0.80]
  ], palette.warm, 7);
}

function roundedRect(canvas, x, y, width, height, radius, color, alpha = 255) {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const x1 = Math.round(x + width);
  const y1 = Math.round(y + height);
  const r = Math.round(radius);
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      const dx = px < x0 + r ? x0 + r - px : px > x1 - r ? px - (x1 - r) : 0;
      const dy = py < y0 + r ? y0 + r - py : py > y1 - r ? py - (y1 - r) : 0;
      if (dx * dx + dy * dy <= r * r) setPixel(canvas, px, py, color, alpha);
    }
  }
}

function circle(canvas, cx, cy, radius, color, alpha = 255) {
  const x0 = Math.round(cx - radius);
  const x1 = Math.round(cx + radius);
  const y0 = Math.round(cy - radius);
  const y1 = Math.round(cy + radius);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) setPixel(canvas, x, y, color, alpha);
    }
  }
}

function drawPath(canvas, points, color, thickness) {
  for (let i = 0; i < points.length - 1; i += 1) {
    line(canvas, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], color, thickness);
  }
}

function line(canvas, x0, y0, x1, y1, color, thickness) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    circle(canvas, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, thickness / 2, color, 230);
  }
}

function setPixel(canvas, x, y, color, alpha = 255) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return;
  const offset = py * (canvas.width * 4 + 1) + 1 + px * 4;
  const a = alpha / 255;
  canvas.bytes[offset] = clamp(color[0] * a + canvas.bytes[offset] * (1 - a));
  canvas.bytes[offset + 1] = clamp(color[1] * a + canvas.bytes[offset + 1] * (1 - a));
  canvas.bytes[offset + 2] = clamp(color[2] * a + canvas.bytes[offset + 2] * (1 - a));
  canvas.bytes[offset + 3] = 255;
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function makePng(width, height, rgbaWithFilterBytes) {
  const signature = Buffer.from("89504e470d0a1a0a", "hex");
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(rgbaWithFilterBytes)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
