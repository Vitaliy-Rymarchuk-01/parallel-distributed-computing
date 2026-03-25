import "dotenv/config";

import express from "express";
import { LeaderElection } from "./leader-election.js";
import { ServiceRegistry } from "./service-registry.js";

const app = express();
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
