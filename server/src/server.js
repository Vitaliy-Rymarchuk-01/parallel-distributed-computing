import "dotenv/config";

import { createApp } from "./app.js";
import { ServiceDiscovery } from "./discovery.js";
import { ServiceRegistry } from "./service-registry.js";

const zkConnectionString = process.env.ZK_CONNECTION_STRING || "localhost:2181";
const registryRoot = process.env.ZK_REGISTRY_ROOT || "/services";

const port = Number(process.env.PORT) || 8080;

const app = createApp();

app.listen(port, "0.0.0.0", () => {
  console.log(`server listening on http://localhost:${port}`);
});

const registry = new ServiceRegistry({
  connectionString: zkConnectionString,
  registryRoot,
  serviceName: process.env.SERVICE_NAME || "server",
  nodeId: process.env.SERVICE_NODE_ID || "server-1",
  host: process.env.SERVICE_HOST || "server",
  port: Number(process.env.SERVICE_PORT) || port,
});

const workerDiscovery = new ServiceDiscovery({
  connectionString: zkConnectionString,
  registryRoot,
  serviceName: "worker",
});

void (async () => {
  try {
    await registry.start();
    await workerDiscovery.start();
  } catch (error) {
    console.error("failed to init zookeeper registry/discovery", error);
  }
})();
