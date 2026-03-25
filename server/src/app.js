import cors from "cors";
import express from "express";

export function createApp({ workerDiscovery } = {}) {
  const app = express();

  app.use(
    cors({
      origin: ["http://localhost:3000", "https://pdc-client.vercel.app"],
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

  return app;
}
