const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const app = express();
const port = 3000;

const topic = "frame_noticifation";

app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));

function updateCoordinate() {
  const randomX = Math.random() * 20;
  fs.writeFile(
    "/Users/ekaeo/Downloads/short/server/coordinate.txt",
    randomX.toString(),
    (err) => {
      if (err) {
        console.error("Error writing file:", err);
      } else {
        console.log("Updated coordinate:", randomX);
      }
    }
  );
}

setInterval(updateCoordinate, 10000);

app.get("/obstacle-coordinates", (req, res) => {
  fs.readFile(
    "/Users/ekaeo/Downloads/short/server/coordinate.txt",
    "utf8",
    (err, data) => {
      if (err) {
        console.error("Error reading file:", err);
        res.status(500).send("Error reading coordinate file");
        return;
      }
      res.json({ x: parseFloat(data) });
    }
  );
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
