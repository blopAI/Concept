const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const app = express();
const port = 3000;

const topic = "frame_noticifation";

app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));

let distance = 0; // Declare distance at the top level of your file

app.post("/sensor-data", (req, res) => {
  distance = req.body.distance; // Update distance inside your POST handler
  console.log("Received distance:", distance);
  res.sendStatus(200);
});

app.get("/sensor-data", (req, res) => {
  console.log("GET /sensor-data request:", req);
  console.log("GET /sensor-data response:", res);
  res.json({ distance: distance });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
