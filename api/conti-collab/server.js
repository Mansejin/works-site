import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Y from "yjs";
import { WebSocketServer } from "ws";
import { setupWSConnection, setPersistence } from "y-websocket/bin/utils";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8789);
const CONTI_DIR = process.env.CONTI_DATA_DIR || path.join(__dirname, "..", "data", "conti");
const YJS_DIR = path.join(CONTI_DIR, ".yjs");
const PERSIST_DEBOUNCE_MS = Number(process.env.CONTI_PERSIST_DEBOUNCE_MS || 2000);

const HEADERS = ["대본", "장면", "사이즈", "자막", "코멘트"];
const ROOM_PREFIX = "conti-";

const persistTimers = new Map();

function projectFromRoom(room) {
  if (!room.startsWith(ROOM_PREFIX)) return null;
  const slug = room.slice(ROOM_PREFIX.length);
  return /^[a-z0-9-]+$/.test(slug) ? slug : null;
}

function contiJsonPath(project) {
  return path.join(CONTI_DIR, `${project}.json`);
}

function yjsBinPath(room) {
  return path.join(YJS_DIR, `${room}.bin`);
}

function normalizeRow(row) {
  const source = row && typeof row === "object" ? row : {};
  return Object.fromEntries(
    HEADERS.map((key) => [key, String(source[key] || "").trim()])
  );
}

function normalizeRows(rows) {
  return (rows || [])
    .map(normalizeRow)
    .filter((row) => HEADERS.some((key) => row[key]));
}

function rowsFromYdoc(ydoc) {
  const title = ydoc.getText("title").toString();
  const yRows = ydoc.getArray("rows");
  const rows = [];
  yRows.forEach((yMap) => {
    if (!(yMap instanceof Y.Map)) return;
    rows.push(normalizeRow(Object.fromEntries(HEADERS.map((key) => [key, yMap.get(key) || ""]))));
  });
  return { title: title.trim(), rows: normalizeRows(rows) };
}

function loadRowsIntoYdoc(ydoc, rows) {
  const yRows = ydoc.getArray("rows");
  yRows.delete(0, yRows.length);
  for (const row of normalizeRows(rows)) {
    const yMap = new Y.Map();
    HEADERS.forEach((key) => yMap.set(key, row[key] || ""));
    yRows.push([yMap]);
  }
}

async function readContiJson(project) {
  try {
    const raw = await fs.readFile(contiJsonPath(project), "utf8");
    const data = JSON.parse(raw);
    return {
      title: String(data.title || "").trim(),
      rows: normalizeRows(data.rows),
      updatedAt: Number(data.updatedAt || 0),
    };
  } catch {
    return { title: "", rows: [], updatedAt: 0 };
  }
}

async function writeContiJson(project, payload) {
  await fs.mkdir(CONTI_DIR, { recursive: true });
  const body = {
    project,
    title: payload.title || "",
    updatedAt: payload.updatedAt || Date.now(),
    rows: normalizeRows(payload.rows),
  };
  await fs.writeFile(contiJsonPath(project), `${JSON.stringify(body, null, 2)}\n`, "utf8");
  return body;
}

async function persistDocument(room, ydoc) {
  const project = projectFromRoom(room);
  if (!project) return;

  await fs.mkdir(YJS_DIR, { recursive: true });
  const update = Y.encodeStateAsUpdate(ydoc);
  await fs.writeFile(yjsBinPath(room), Buffer.from(update));

  const { title, rows } = rowsFromYdoc(ydoc);
  await writeContiJson(project, { title, rows, updatedAt: Date.now() });
}

function schedulePersist(room, ydoc) {
  clearTimeout(persistTimers.get(room));
  persistTimers.set(
    room,
    setTimeout(() => {
      persistDocument(room, ydoc).catch((err) => {
        console.error(`[conti-collab] persist failed (${room})`, err);
      });
    }, PERSIST_DEBOUNCE_MS)
  );
}

setPersistence({
  bindState: async (room, ydoc) => {
    const project = projectFromRoom(room);
    if (!project) return;

    try {
      const bin = await fs.readFile(yjsBinPath(room));
      Y.applyUpdate(ydoc, bin);
    } catch {
      const json = await readContiJson(project);
      ydoc.transact(() => {
        const yTitle = ydoc.getText("title");
        yTitle.delete(0, yTitle.length);
        if (json.title) yTitle.insert(0, json.title);
        loadRowsIntoYdoc(ydoc, json.rows);
      });
      await persistDocument(room, ydoc);
    }

    ydoc.on("update", () => schedulePersist(room, ydoc));
  },
  writeState: async (room, ydoc) => {
    clearTimeout(persistTimers.get(room));
    persistTimers.delete(room);
    await persistDocument(room, ydoc);
  },
});

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("conti-collab ok\n");
});

const wss = new WebSocketServer({ noServer: true });
wss.on("connection", setupWSConnection);

server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[conti-collab] ws://${HOST}:${PORT} data=${CONTI_DIR}`);
});
