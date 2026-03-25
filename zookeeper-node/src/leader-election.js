import zookeeper from "node-zookeeper-client";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class LeaderElection {
  constructor({ nodeId, connectionString, electionPath }) {
    this.nodeId = nodeId;
    this.connectionString = connectionString;
    this.electionPath = electionPath;
    this.client = zookeeper.createClient(connectionString, {
      sessionTimeout: 15000,
      spinDelay: 1000,
      retries: 10,
    });
    this.role = "follower";
    this.myNodePath = null;
    this.mySequence = null;
    this.state = {
      nodeId,
      connectionString,
      electionPath,
      role: this.role,
      nodePath: null,
      leader: null,
    };
    this.reconnecting = false;
    this.started = false;
  }

  getRole() {
    return this.role;
  }

  getState() {
    return this.state;
  }

  async start() {
    if (this.started) {
      return;
    }

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

    await this.ensurePath(this.electionPath);
    await this.joinElection();

    this.started = true;

    this.client.removeAllListeners("error");
    this.client.on("error", (error) => {
      console.error(`[${this.nodeId}] ZooKeeper client error`, error);
    });

    this.client.removeAllListeners("disconnected");
    this.client.on("disconnected", () => {
      console.warn(`[${this.nodeId}] ZooKeeper disconnected`);
      this.started = false;
      this.role = "follower";
      this.state.role = this.role;
      this.state.leader = null;
    });

    this.client.removeAllListeners("expired");
    this.client.on("expired", async () => {
      if (this.reconnecting) return;
      this.reconnecting = true;
      console.log(`[${this.nodeId}] session expired, reconnecting`);
      this.role = "follower";
      this.state.role = this.role;
      this.state.leader = null;
      this.myNodePath = null;
      this.mySequence = null;
      await delay(1000);
      try {
        this.client.close();
      } catch (closeError) {
        console.error(`[${this.nodeId}] close error`, closeError);
      }
      this.client = zookeeper.createClient(this.connectionString, {
        sessionTimeout: 15000,
        spinDelay: 1000,
        retries: 10,
      });
      this.reconnecting = false;
      this.started = false;
      try {
        await this.start();
      } catch (startError) {
        console.error(`[${this.nodeId}] reconnect start failed`, startError);
      }
    });
  }

  async ensurePath(path) {
    await new Promise((resolve, reject) => {
      this.client.exists(path, (error, stat) => {
        if (error) return reject(error);
        if (stat) return resolve();
        this.client.create(
          path,
          zookeeper.CreateMode.PERSISTENT,
          (createError) => {
            if (
              createError &&
              createError.getCode &&
              createError.getCode() !== zookeeper.Exception.NODE_EXISTS
            ) {
              return reject(createError);
            }
            resolve();
          },
        );
      });
    });
  }

  async joinElection() {
    const prefix = `${this.electionPath}/node-`;
    this.myNodePath = await new Promise((resolve, reject) => {
      this.client.create(
        prefix,
        Buffer.from(this.nodeId),
        zookeeper.CreateMode.EPHEMERAL_SEQUENTIAL,
        (error, createdPath) => {
          if (error) return reject(error);
          resolve(createdPath);
        },
      );
    });

    this.mySequence = this.myNodePath.split("node-").pop();
    this.state.nodePath = this.myNodePath;
    await this.checkLeadership();
  }

  async checkLeadership() {
    const children = await new Promise((resolve, reject) => {
      this.client.getChildren(this.electionPath, (error, kids) => {
        if (error) return reject(error);
        resolve(kids.sort());
      });
    });

    const myNodeName = this.myNodePath.split("/").pop();
    const index = children.indexOf(myNodeName);

    if (index === -1) {
      console.warn(
        `[${this.nodeId}] node not found in election children, rejoining election`,
      );
      await this.joinElection();
      return;
    }

    if (index === 0) {
      this.role = "leader";
      this.state.role = this.role;
      this.state.leader = this.nodeId;
      console.log(`[${this.nodeId}] became LEADER at ${this.myNodePath}`);
      return;
    }

    this.role = "follower";
    this.state.role = this.role;

    const predecessor = children[index - 1];
    this.watchPredecessor(predecessor);
  }

  watchPredecessor(predecessor) {
    const predecessorPath = `${this.electionPath}/${predecessor}`;

    this.client.exists(
      predecessorPath,
      (event) => {
        if (event.getType && event.getType() === zookeeper.Event.NODE_DELETED) {
          this.checkLeadership().catch((error) => {
            console.error(`[${this.nodeId}] leadership re-check failed`, error);
          });
        }
      },
      (error) => {
        if (error) {
          console.error(`[${this.nodeId}] watch registration failed`, error);
          return;
        }

        this.client.exists(predecessorPath, (existsError, stat) => {
          if (existsError) {
            console.error(`[${this.nodeId}] exists check failed`, existsError);
            return;
          }

          if (!stat) {
            this.checkLeadership().catch((leadershipError) => {
              console.error(
                `[${this.nodeId}] leadership check failed`,
                leadershipError,
              );
            });
          }
        });
      },
    );
  }
}
