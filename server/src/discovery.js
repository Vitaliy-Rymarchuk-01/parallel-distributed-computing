import zookeeper from "node-zookeeper-client";

async function ensurePath(client, path) {
  await new Promise((resolve, reject) => {
    client.exists(path, (error, stat) => {
      if (error) return reject(error);
      if (stat) return resolve();
      client.create(path, zookeeper.CreateMode.PERSISTENT, (createError) => {
        if (
          createError &&
          createError.getCode &&
          createError.getCode() !== zookeeper.Exception.NODE_EXISTS
        ) {
          return reject(createError);
        }
        resolve();
      });
    });
  });
}

export class ServiceDiscovery {
  constructor({ connectionString, registryRoot = "/services", serviceName }) {
    this.connectionString = connectionString;
    this.registryRoot = registryRoot;
    this.serviceName = serviceName;

    this.client = zookeeper.createClient(connectionString, {
      sessionTimeout: 15000,
      spinDelay: 1000,
      retries: 10,
    });

    this.path = `${this.registryRoot}/${this.serviceName}`;
    this.instances = [];
    this.started = false;
    this.reconnecting = false;
  }

  getInstances() {
    return this.instances;
  }

  async start() {
    if (this.started) return;

    await new Promise((resolve) => {
      this.client.once("connected", resolve);
      this.client.connect();
    });

    this.client.removeAllListeners("error");
    this.client.on("error", (error) => {
      console.error(`[discovery:${this.serviceName}] zookeeper error`, error);
    });

    this.client.removeAllListeners("disconnected");
    this.client.on("disconnected", () => {
      console.warn(`[discovery:${this.serviceName}] zookeeper disconnected`);
      this.started = false;
    });

    this.client.removeAllListeners("expired");
    this.client.on("expired", async () => {
      if (this.reconnecting) return;
      this.reconnecting = true;
      console.warn(
        `[discovery:${this.serviceName}] session expired, reconnecting`,
      );

      try {
        this.client.close();
      } catch (error) {
        console.error(`[discovery:${this.serviceName}] close error`, error);
      }

      this.client = zookeeper.createClient(this.connectionString, {
        sessionTimeout: 15000,
        spinDelay: 1000,
        retries: 10,
      });

      this.started = false;
      this.reconnecting = false;

      try {
        await this.start();
      } catch (error) {
        console.error(
          `[discovery:${this.serviceName}] reconnect failed`,
          error,
        );
      }
    });

    await ensurePath(this.client, this.registryRoot);
    await ensurePath(this.client, this.path);

    this.started = true;
    await this.refreshWithWatch();
  }

  async refreshWithWatch() {
    const children = await new Promise((resolve) => {
      this.client.getChildren(
        this.path,
        () => {
          this.refreshWithWatch().catch((error) => {
            console.error(
              `[discovery:${this.serviceName}] refresh failed`,
              error,
            );
          });
        },
        (error, kids) => {
          if (error) return resolve([]);
          resolve(kids);
        },
      );
    });

    const instances = await Promise.all(
      children.map(
        (child) =>
          new Promise((resolve) => {
            const childPath = `${this.path}/${child}`;
            this.client.getData(childPath, (error, data) => {
              if (error) return resolve(null);
              try {
                resolve(JSON.parse(data.toString("utf8")));
              } catch {
                resolve(null);
              }
            });
          }),
      ),
    );

    this.instances = instances.filter(Boolean);
  }
}
