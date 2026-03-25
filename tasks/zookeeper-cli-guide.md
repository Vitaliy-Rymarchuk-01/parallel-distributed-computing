# ZooKeeper CLI Guide for Task 2

## 1. Connect to ZooKeeper CLI

### Command
```bash
zkCli.sh -server localhost:2181
```

### Purpose
Opens the ZooKeeper interactive CLI and connects to one ZooKeeper node.

### Notes
- If you run a 3-node ensemble, you can connect to any node.
- Typical ports in local Docker setups are `2181`, `2182`, `2183`.

---

## 2. Show the current path

### Command
```bash
pwd
```

### Purpose
Shows the current znode path in the CLI.

---

## 3. List children of a znode

### Command
```bash
ls /
```

### Purpose
Lists the immediate child znodes under the given path.

### Why it matters
Useful for checking whether your application created znodes such as:
- election nodes,
- worker nodes,
- locks,
- service state nodes.

---

## 4. Read znode data

### Command
```bash
get /some-znode
```

### Purpose
Reads data stored in a znode.

### Notes
- If the znode has watchers, `get` can also show metadata.
- Helpful for debugging your leader election state.

---

## 5. Create a persistent znode

### Command
```bash
create /app "hello"
```

### Purpose
Creates a persistent znode with data.

### When to use
Use it for:
- shared application configuration,
- root paths for election,
- demo znodes.

---

## 6. Create an ephemeral znode

### Command
```bash
create -e /app/node-1 "worker-1"
```

### Purpose
Creates a znode that disappears when the client session ends.

### Why it matters
Ephemeral znodes are useful in leader election and distributed locking because:
- they automatically vanish when the node dies,
- other nodes can detect the loss and re-elect a leader.

---

## 7. Create an ephemeral sequential znode

### Command
```bash
create -e -s /election/node- "worker-1"
```

### Purpose
Creates an ephemeral sequential znode with an auto-incremented suffix.

### Why it matters
This is the classic ZooKeeper recipe for leader election:
- every node creates an ephemeral sequential znode,
- the node with the smallest sequence becomes leader,
- other nodes watch the node immediately before them.

---

## 8. Delete a znode

### Command
```bash
delete /app/node-1
```

### Purpose
Deletes a znode that has no children.

### Notes
If the znode has children, ZooKeeper will reject deletion.

---

## 9. Delete a znode recursively

### Command
```bash
rmr /app
```

### Purpose
Removes a znode and all its children.

### Notes
- In newer ZooKeeper setups, `deleteall` may be preferred depending on version.
- Use carefully in demos.

---

## 10. Watch a znode

### Command
```bash
get -w /election/node-0000000001
```

### Purpose
Registers a watcher that fires when the znode changes or disappears.

### Why it matters
This is how followers detect leader failure and trigger re-election.

---

## 11. Watch children of a path

### Command
```bash
ls -w /election
```

### Purpose
Registers a watcher on the children list of a path.

### Why it matters
Useful for observing election participants and debugging herd-effect mitigation.

---

## 12. Check ZooKeeper health / session state

### Command
```bash
stat
```

### Purpose
Prints information about the current ZooKeeper connection.

### Why it matters
Helps show that the client is connected and responsive.

---

## 13. Exit the CLI

### Command
```bash
quit
```

### Purpose
Closes the ZooKeeper CLI session.

---

## Practical commands for the lab demo

A minimal demo sequence could be:

```bash
zkCli.sh -server localhost:2181
ls /
create /election "root"
create -e -s /election/node- "node-1"
get -w /election/node-0000000001
ls /election
```

Then:
- stop the leader node,
- show that its ephemeral znode disappears,
- show that another node becomes leader.

---