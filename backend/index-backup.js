const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { CosmosClient } = require("@azure/cosmos");

const app = express();
app.use(cors());
app.use(express.json());

const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const database = client.database("taskdb");
const boardsContainer = database.container("boards");
const tasksContainer = database.container("tasks");
const commentsContainer = database.container("comments");

// health check (gateway probe ku)
app.get("/api/health", (req, res) => res.status(200).send("ok"));

// list boards
app.get("/api/boards", async (req, res) => {
  const { resources } = await boardsContainer.items.readAll().fetchAll();
  res.json(resources);
});

// create board
app.post("/api/boards", async (req, res) => {
  const { resource } = await boardsContainer.items.create(req.body);
  res.status(201).json(resource);
});

// list tasks for a board
app.get("/api/boards/:boardId/tasks", async (req, res) => {
  const { resources } = await tasksContainer.items
    .query({
      query: "SELECT * FROM c WHERE c.boardId = @boardId",
      parameters: [{ name: "@boardId", value: req.params.boardId }],
    })
    .fetchAll();
  res.json(resources);
});

// create task
app.post("/api/boards/:boardId/tasks", async (req, res) => {
  const task = { ...req.body, boardId: req.params.boardId, status: "todo" };
  const { resource } = await tasksContainer.items.create(task);
  res.status(201).json(resource);
});

// update task status
app.patch("/api/tasks/:id", async (req, res) => {
  const { id } = req.params;
  const { boardId, status } = req.body;
  const { resource } = await tasksContainer.item(id, boardId).read();
  resource.status = status;
  const { resource: updated } = await tasksContainer.item(id, boardId).replace(resource);
  res.json(updated);
});

// add comment to a task
app.post("/api/tasks/:taskId/comments", async (req, res) => {
  const comment = { ...req.body, taskId: req.params.taskId };
  const { resource } = await commentsContainer.items.create(comment);
  res.status(201).json(resource);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
