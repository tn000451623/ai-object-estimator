import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json({ limit: "50mb" }));

// API Routes
app.post("/api/training-data", (req, res) => {
  try {
    const data = req.body;
    const logEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...data
    }) + "\n";
    
    // Note: Vercel's filesystem is read-only except for /tmp
    // This will only work temporarily during the function execution
    const filePath = path.join("/tmp", "training_data.jsonl");
    fs.appendFileSync(filePath, logEntry);
    
    console.log("Training data recorded (temporarily in /tmp)");
    res.json({ success: true, message: "Data recorded in temporary storage" });
  } catch (error) {
    console.error("Error saving training data:", error);
    res.status(500).json({ error: "Failed to save data" });
  }
});

app.get("/api/training-data/download", (req, res) => {
  const filePath = path.join("/tmp", "training_data.jsonl");
  if (fs.existsSync(filePath)) {
    res.download(filePath, "training_data.jsonl");
  } else {
    res.status(404).json({ error: "No training data found in temporary storage" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", environment: "vercel" });
});

export default app;
