import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // API Routes
  app.post("/api/training-data", (req, res) => {
    try {
      const data = req.body;
      const logEntry = JSON.stringify({
        timestamp: new Date().toISOString(),
        ...data
      }) + "\n";
      
      const filePath = path.join(__dirname, "training_data.jsonl");
      fs.appendFileSync(filePath, logEntry);
      
      console.log("Training data recorded");
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving training data:", error);
      res.status(500).json({ error: "Failed to save data" });
    }
  });

  app.get("/api/training-data/download", (req, res) => {
    const filePath = path.join(__dirname, "training_data.jsonl");
    if (fs.existsSync(filePath)) {
      res.download(filePath, "training_data.jsonl");
    } else {
      res.status(404).json({ error: "No training data found yet" });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
