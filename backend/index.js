const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { CosmosClient } = require("@azure/cosmos");
const { DefaultAzureCredential } = require("@azure/identity");

const app = express();
app.use(cors());
app.use(express.json());

const client = process.env.COSMOS_CONNECTION_STRING
  ? new CosmosClient(process.env.COSMOS_CONNECTION_STRING)
  : new CosmosClient({ endpoint: process.env.COSMOS_ENDPOINT, aadCredentials: new DefaultAzureCredential() });

const database = client.database("taskdb");
const boardsContainer = database.container("boards");
const tasksContainer = database.container("tasks");
const commentsContainer = database.container("comments");

app.get("/api/health", (req, res) => res.status(200).send("ok"));

// ---------- BOARDS ----------
app.get("/api/boards", async (req, res) => {
  const { resources } = await boardsContainer.items.readAll().fetchAll();
  res.json(resources);
});

app.post("/api/boards", async (req, res) => {
  const { resource } = await boardsContainer.items.create(req.body);
  res.status(201).json(resource);
});

app.put("/api/boards/:id", async (req, res) => {
  const { id } = req.params;
  const { ownerId } = req.body;
  const { resource } = await boardsContainer.item(id, ownerId).read();
  const updated = { ...resource, ...req.body };
  const { resource: saved } = await boardsContainer.item(id, ownerId).replace(updated);
  res.json(saved);
});

app.delete("/api/boards/:id", async (req, res) => {
  const { id } = req.params;
  const { ownerId } = req.query;
  await boardsContainer.item(id, ownerId).delete();
  res.status(204).send();
});

// ---------- TASKS ----------
app.get("/api/boards/:boardId/tasks", async (req, res) => {
  const { resources } = await tasksContainer.items
    .query({ query: "SELECT * FROM c WHERE c.boardId = @boardId", parameters: [{ name: "@boardId", value: req.params.boardId }] })
    .fetchAll();
  res.json(resources);
});

app.post("/api/boards/:boardId/tasks", async (req, res) => {
  const task = { ...req.body, boardId: req.params.boardId, status: req.body.status || "todo" };
  const { resource } = await tasksContainer.items.create(task);
  res.status(201).json(resource);
});

app.put("/api/tasks/:id", async (req, res) => {
  const { id } = req.params;
  const { boardId } = req.body;
  const { resource } = await tasksContainer.item(id, boardId).read();
  const updated = { ...resource, ...req.body };
  const { resource: saved } = await tasksContainer.item(id, boardId).replace(updated);
  res.json(saved);
});

app.delete("/api/tasks/:id", async (req, res) => {
  const { id } = req.params;
  const { boardId } = req.query;
  await tasksContainer.item(id, boardId).delete();
  res.status(204).send();
});

// ---------- COMMENTS ----------
app.get("/api/tasks/:taskId/comments", async (req, res) => {
  const { resources } = await commentsContainer.items
    .query({ query: "SELECT * FROM c WHERE c.taskId = @taskId", parameters: [{ name: "@taskId", value: req.params.taskId }] })
    .fetchAll();
  res.json(resources);
});

app.post("/api/tasks/:taskId/comments", async (req, res) => {
  const comment = { ...req.body, taskId: req.params.taskId };
  const { resource } = await commentsContainer.items.create(comment);
  res.status(201).json(resource);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
