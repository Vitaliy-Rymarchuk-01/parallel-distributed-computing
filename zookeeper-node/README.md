# ZooKeeper Leader Election Node

This service is a Node.js implementation of leader election using ZooKeeper.

## Purpose

- join an election with ephemeral sequential znodes,
- elect the smallest sequence as leader,
- watch the predecessor to avoid herd effect,
- expose `/health` and `/state` for demo purposes.

## Endpoints

- `GET /health` — current node status
- `GET /state` — node role and znode information

## Environment variables

- `PORT` — HTTP port, default `4000`
- `NODE_ID` — identifier of the node instance
- `ZK_CONNECTION_STRING` — ZooKeeper connection string
- `ZK_ELECTION_PATH` — election root path, default `/election`

## Demo idea

Start several node instances with different `NODE_ID` values. The node with the smallest ephemeral sequential znode becomes leader. If you stop the leader, one of the followers should take over automatically.
