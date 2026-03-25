import "dotenv/config";

import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { LeaderElection } from "./leader-election.js";
import { ServiceRegistry } from "./service-registry.js";

const app = express();
app.use(express.json({ limit: "2mb" }));
const port = Number(process.env.PORT) || 4000;
const nodeId =
  process.env.NODE_ID || `node-${Math.random().toString(16).slice(2, 8)}`;
const zkConnectionString = process.env.ZK_CONNECTION_STRING || "localhost:2181";
const electionPath = process.env.ZK_ELECTION_PATH || "/election";

const registryRoot = process.env.ZK_REGISTRY_ROOT || "/services";
const serviceName = process.env.SERVICE_NAME || "worker";
const serviceNodeId = process.env.SERVICE_NODE_ID || nodeId;
const serviceHost = process.env.SERVICE_HOST || nodeId;
const servicePort = Number(process.env.SERVICE_PORT) || port;

const election = new LeaderElection({
  nodeId,
  connectionString: zkConnectionString,
  electionPath,
});

const booksDir = process.env.BOOKS_DIR || "/books";

function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function computeTf(tokens) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  const max = Math.max(1, ...tf.values());
  const norm = new Map();
  for (const [term, count] of tf.entries()) {
    norm.set(term, count / max);
  }
  return norm;
}

async function listTxtFiles() {
  const entries = await fs.readdir(booksDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".txt"))
    .map((e) => e.name)
    .sort();
}

async function readDocTokens(docName) {
  const fullPath = path.join(booksDir, docName);
  const content = await fs.readFile(fullPath, "utf8");
  return tokenize(content);
}

async function computeDfForDocs(terms, docs) {
  const df = Object.fromEntries(terms.map((t) => [t, 0]));
  let docCount = 0;
  for (const doc of docs) {
    const tokens = await readDocTokens(doc);
    const unique = new Set(tokens);
    for (const term of terms) {
      if (unique.has(term)) df[term] += 1;
    }
    docCount += 1;
  }
  return { docCount, df };
}

async function scoreDocs({ terms, idf, docs, topN, minScore }) {
  const scored = [];
  for (const doc of docs) {
    const tokens = await readDocTokens(doc);
    const tf = computeTf(tokens);
    let score = 0;
    for (const term of terms) {
      score += (tf.get(term) || 0) * (idf[term] || 0);
    }
    if (score >= minScore) {
      scored.push({ doc, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", nodeId, role: election.getRole() });
});

app.get("/state", (_req, res) => {
  res.json(election.getState());
});

app.get("/books", async (_req, res) => {
  try {
    res.json({ books: await listTxtFiles() });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/search/df", async (req, res) => {
  const { terms, docs } = req.body || {};
  if (!Array.isArray(terms) || terms.length === 0) {
    res.status(400).json({ error: "terms must be a non-empty array" });
    return;
  }

  console.log(
    `[${nodeId}] /search/df docs=${Array.isArray(docs) ? docs.length : "all"} terms=${terms.join(",")}`,
  );

  try {
    const allDocs =
      Array.isArray(docs) && docs.length ? docs : await listTxtFiles();
    const result = await computeDfForDocs(terms, allDocs);
    console.log(`[${nodeId}] /search/df done docCount=${result.docCount}`);
    res.json(result);
  } catch (error) {
    console.error(`[${nodeId}] /search/df failed`, error);
    res.status(500).json({ error: String(error) });
  }
});

app.post("/search/score", async (req, res) => {
  const { terms, idf, docs, topN = 10, minScore = 0 } = req.body || {};
  if (!Array.isArray(terms) || terms.length === 0) {
    res.status(400).json({ error: "terms must be a non-empty array" });
    return;
  }
  if (!idf || typeof idf !== "object") {
    res.status(400).json({ error: "idf must be an object" });
    return;
  }

  console.log(
    `[${nodeId}] /search/score docs=${Array.isArray(docs) ? docs.length : "all"} topN=${topN} minScore=${minScore} terms=${terms.join(",")}`,
  );

  try {
    const allDocs =
      Array.isArray(docs) && docs.length ? docs : await listTxtFiles();
    const scored = await scoreDocs({
      terms,
      idf,
      docs: allDocs,
      topN: Number(topN) || 10,
      minScore: Number(minScore) || 0,
    });
    console.log(`[${nodeId}] /search/score done results=${scored.length}`);
    res.json({ results: scored });
  } catch (error) {
    console.error(`[${nodeId}] /search/score failed`, error);
    res.status(500).json({ error: String(error) });
  }
});

app.post("/cluster/search", async (req, res) => {
  if (election.getRole() !== "leader") {
    res.status(409).json({ error: "not leader" });
    return;
  }

  const { phrase, topN = 10, minScore = 0, workers } = req.body || {};
  if (typeof phrase !== "string" || !phrase.trim()) {
    res.status(400).json({ error: "phrase must be a non-empty string" });
    return;
  }
  if (!Array.isArray(workers) || workers.length === 0) {
    res.status(400).json({ error: "workers must be a non-empty array" });
    return;
  }

  const terms = tokenize(phrase);
  if (terms.length === 0) {
    res.json({ results: [] });
    return;
  }

  try {
    const docs = await listTxtFiles();
    const shards = workers.map(() => []);
    docs.forEach((doc, idx) => {
      shards[idx % workers.length].push(doc);
    });

    console.log(
      `[${nodeId}] /cluster/search phrase="${phrase}" docs=${docs.length} workers=${workers.length}`,
    );

    const dfSettled = await Promise.allSettled(
      workers.map(async (w, idx) => {
        console.log(
          `[${nodeId}] /cluster/search -> df ${w.host}:${w.port} shardDocs=${shards[idx].length}`,
        );
        const r = await fetch(`http://${w.host}:${w.port}/search/df`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ terms, docs: shards[idx] }),
        });
        if (!r.ok) throw new Error(`df failed for ${w.host}:${w.port}`);
        return r.json();
      }),
    );

    const dfResponses = dfSettled
      .filter((x) => x.status === "fulfilled")
      .map((x) => x.value);

    if (dfResponses.length === 0) {
      res.status(503).json({ error: "no workers available for df" });
      return;
    }

    console.log(
      `[${nodeId}] /cluster/search df collected from ${dfResponses.length}/${workers.length} workers`,
    );

    const globalDf = Object.fromEntries(terms.map((t) => [t, 0]));
    let globalDocCount = 0;
    for (const item of dfResponses) {
      globalDocCount += item.docCount || 0;
      for (const term of terms) {
        globalDf[term] += (item.df && item.df[term]) || 0;
      }
    }

    const idf = {};
    for (const term of terms) {
      const dfVal = globalDf[term] || 0;
      idf[term] = Math.log((globalDocCount + 1) / (dfVal + 1)) + 1;
    }

    console.log(`[${nodeId}] /cluster/search globalDocCount=${globalDocCount}`);

    const scoreSettled = await Promise.allSettled(
      workers.map(async (w, idx) => {
        console.log(
          `[${nodeId}] /cluster/search -> score ${w.host}:${w.port} shardDocs=${shards[idx].length}`,
        );
        const r = await fetch(`http://${w.host}:${w.port}/search/score`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            terms,
            idf,
            docs: shards[idx],
            topN: Number(topN) || 10,
            minScore: Number(minScore) || 0,
          }),
        });
        if (!r.ok) throw new Error(`score failed for ${w.host}:${w.port}`);
        return r.json();
      }),
    );

    const scoreResponses = scoreSettled
      .filter((x) => x.status === "fulfilled")
      .map((x) => x.value);

    const merged = scoreResponses.flatMap((r) => (r && r.results) || []);
    merged.sort((a, b) => b.score - a.score);
    const results = merged.slice(0, Number(topN) || 10).map((r) => ({
      ...r,
      url: `/documents/${encodeURIComponent(r.doc)}`,
    }));
    console.log(`[${nodeId}] /cluster/search merged results=${results.length}`);
    res.json({ results });
  } catch (error) {
    console.error(`[${nodeId}] /cluster/search failed`, error);
    res.status(500).json({ error: String(error) });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`[${nodeId}] status server listening on ${port}`);
});

try {
  const registry = new ServiceRegistry({
    connectionString: zkConnectionString,
    registryRoot,
    serviceName,
    nodeId: serviceNodeId,
    host: serviceHost,
    port: servicePort,
  });
  await registry.start();
  await election.start();
} catch (error) {
  console.error(`[${nodeId}] failed to start leader election`, error);
}
