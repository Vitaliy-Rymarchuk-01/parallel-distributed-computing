import "dotenv/config";

import express from "express";
import { LeaderElection } from "./leader-election.js";

const app = express();
const port = Number(process.env.PORT) || 4000;
const nodeId =
  process.env.NODE_ID || `node-${Math.random().toString(16).slice(2, 8)}`;
const zkConnectionString = process.env.ZK_CONNECTION_STRING || "localhost:2181";
const electionPath = process.env.ZK_ELECTION_PATH || "/election";

const election = new LeaderElection({
  nodeId,
  connectionString: zkConnectionString,
  electionPath,
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", nodeId, role: election.getRole() });
});

app.get("/state", (_req, res) => {
  res.json(election.getState());
});

app.listen(port, "0.0.0.0", () => {
  console.log(`[${nodeId}] status server listening on ${port}`);
});

try {
  await election.start();
} catch (error) {
  console.error(`[${nodeId}] failed to start leader election`, error);
}
