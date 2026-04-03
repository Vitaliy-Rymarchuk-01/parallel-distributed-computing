import cors from "cors";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";

export function createApp({ workerDiscovery } = {}) {
  const app = express();

  app.use(express.json({ limit: "2mb" }));
  app.use(
    cors({
      origin: [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://parallel-distributed-computing.vercel.app",
      ],
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/discovery/workers", (_req, res) => {
    res.json({
      instances: workerDiscovery ? workerDiscovery.getInstances() : [],
    });
  });

  const booksDir = process.env.BOOKS_DIR || "/books";

  app.get("/documents/:name", async (req, res) => {
    const name = String(req.params.name || "");
    if (
      !name.toLowerCase().endsWith(".txt") ||
      name.includes("..") ||
      name.includes("/")
    ) {
      res.status(400).send("invalid document name");
      return;
    }
    try {
      const fullPath = path.join(booksDir, name);
      const content = await fs.readFile(fullPath, "utf8");
      res.type("text/plain").send(content);
    } catch {
      res.status(404).send("not found");
    }
  });

  app.post("/search", async (req, res) => {
    const { phrase, topN = 10, minScore = 0 } = req.body || {};
    if (typeof phrase !== "string" || !phrase.trim()) {
      res.status(400).json({ error: "phrase must be a non-empty string" });
      return;
    }

    console.log(
      `[server] /search phrase="${phrase}" topN=${topN} minScore=${minScore}`,
    );

    const workers = workerDiscovery ? workerDiscovery.getInstances() : [];
    if (!workers.length) {
      console.warn("[server] /search no workers available from discovery");
      res.status(503).json({ error: "no workers available" });
      return;
    }

    const attempt = async () => {
      const health = await Promise.all(
        workers.map(async (w) => {
          try {
            const r = await fetch(`http://${w.host}:${w.port}/health`);
            if (!r.ok) return null;
            const data = await r.json();
            return { w, data };
          } catch {
            return null;
          }
        }),
      );

      const alive = health.filter(Boolean);
      const leader = alive.find((x) => x.data && x.data.role === "leader");
      if (!leader) {
        console.warn("[server] /search leader not found among alive workers");
        return { status: 503, body: { error: "leader not found" } };
      }

      console.log(
        `[server] /search forwarding to leader ${leader.w.nodeId || leader.w.host}:${leader.w.port} with ${alive.length} alive workers`,
      );

      const r = await fetch(
        `http://${leader.w.host}:${leader.w.port}/cluster/search`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            phrase,
            topN: Number(topN) || 10,
            minScore: Number(minScore) || 0,
            workers: alive.map((x) => x.w),
          }),
        },
      );

      const data = await r.json().catch(() => null);
      console.log(`[server] /search leader response status=${r.status}`);
      return {
        status: r.status,
        body: data || { error: "invalid response from leader" },
      };
    };

    try {
      const first = await attempt();
      if (first.status !== 409) {
        res.status(first.status).json(first.body);
        return;
      }

      const second = await attempt();
      res.status(second.status).json(second.body);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  return app;
}
