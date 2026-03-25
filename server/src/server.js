import "dotenv/config";

import { createApp } from "./app.js";
import { ServiceDiscovery } from "./discovery.js";
import { ServiceRegistry } from "./service-registry.js";

const zkConnectionString = process.env.ZK_CONNECTION_STRING || "localhost:2181";
const registryRoot = process.env.ZK_REGISTRY_ROOT || "/services";

const port = Number(process.env.PORT) || 3001;

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

try {
  await registry.start();
  await workerDiscovery.start();
} catch (error) {
  console.error("failed to init zookeeper registry/discovery", error);
}

const app = createApp({ workerDiscovery });

app.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});
