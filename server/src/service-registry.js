import zookeeper from "node-zookeeper-client";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ServiceRegistry {
  constructor({
    connectionString,
    registryRoot = "/services",
    serviceName,
    nodeId,
    host,
    port,
  }) {
    this.connectionString = connectionString;
    this.registryRoot = registryRoot;
    this.serviceName = serviceName;
    this.nodeId = nodeId;
    this.host = host;
    this.port = port;

    this.client = zookeeper.createClient(connectionString, {
      sessionTimeout: 15000,
      spinDelay: 1000,
      retries: 10,
    });

    this.instancePath = `${this.registryRoot}/${this.serviceName}/instance-${this.nodeId}`;
    this.started = false;
    this.reconnecting = false;
  }

  async start() {
    if (this.started) return;

    await new Promise((resolve, reject) => {
      const onConnected = () => {
        this.client.removeListener("authenticationFailed", onAuthFailed);
        resolve();
      };

      const onAuthFailed = (error) => {
        this.client.removeListener("connected", onConnected);
        reject(error);
      };

      this.client.once("connected", onConnected);
      this.client.once("authenticationFailed", onAuthFailed);
      this.client.connect();
    });

    this.client.removeAllListeners("error");
    this.client.on("error", (error) => {
      console.error(`[${this.nodeId}] ZooKeeper registry client error`, error);
    });

    this.client.removeAllListeners("disconnected");
    this.client.on("disconnected", () => {
      console.warn(`[${this.nodeId}] ZooKeeper registry disconnected`);
      this.started = false;
    });

    this.client.removeAllListeners("expired");
    this.client.on("expired", async () => {
      if (this.reconnecting) return;
      this.reconnecting = true;
      console.warn(`[${this.nodeId}] registry session expired, reconnecting`);

      await delay(1000);
      try {
        this.client.close();
      } catch (closeError) {
        console.error(`[${this.nodeId}] registry close error`, closeError);
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
        console.error(`[${this.nodeId}] registry reconnect failed`, error);
      }
    });

    await this.ensurePath(this.registryRoot);
    await this.ensurePath(`${this.registryRoot}/${this.serviceName}`);
    await this.registerEphemeral();

    this.started = true;
  }

  async ensurePath(path) {
    await new Promise((resolve, reject) => {
      this.client.exists(path, (error, stat) => {
        if (error) return reject(error);
        if (stat) return resolve();

        this.client.create(path, zookeeper.CreateMode.PERSISTENT, (createError) => {
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

  async registerEphemeral() {
    const payload = {
      nodeId: this.nodeId,
      host: this.host,
      port: this.port,
      ts: Date.now(),
    };

    await new Promise((resolve, reject) => {
      this.client.create(
        this.instancePath,
        Buffer.from(JSON.stringify(payload)),
        zookeeper.CreateMode.EPHEMERAL,
        (error) => {
          if (!error) return resolve();

          if (error.getCode && error.getCode() === zookeeper.Exception.NODE_EXISTS) {
            this.client.remove(this.instancePath, -1, (removeError) => {
              if (removeError) return reject(removeError);
              this.client.create(
                this.instancePath,
                Buffer.from(JSON.stringify(payload)),
                zookeeper.CreateMode.EPHEMERAL,
                (retryError) => {
                  if (retryError) return reject(retryError);
                  resolve();
                }
              );
            });
            return;
          }

          reject(error);
        }
      );
    });

    console.log(
      `[${this.nodeId}] registered ${this.serviceName} at ${this.instancePath} -> ${this.host}:${this.port}`
    );
  }
}
