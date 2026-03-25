import cors from "cors";
import express from "express";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: ["http://localhost:3000", "https://pdc-client.vercel.app"],
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  return app;
}
