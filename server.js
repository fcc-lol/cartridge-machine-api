import express from "express";
import dotenv from "dotenv";
import WholeEarthSatelliteImage from "./endpoints/WholeEarthSatelliteImage/index.js";
import AircraftOverhead from "./endpoints/AircraftOverhead/index.js";

dotenv.config();

const app = express();
const port = 3108;

app.use(express.json());

// CORS middleware to allow all origins
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});

const validateApiKey = (req, res, next) => {
  const apiKey = req.query.fccApiKey;
  const validApiKey = process.env.FCC_API_KEY;

  if (!apiKey) {
    return res.status(401).json({
      error: "API key is required",
      message: "Please provide an API key in the fccApiKey query parameter"
    });
  }

  // Handle demo mode
  if (apiKey === "DEMO") {
    req.demoMode = true;
    return next();
  }

  if (apiKey !== validApiKey) {
    return res.status(403).json({
      error: "Invalid API key",
      message: "The provided API key is not valid"
    });
  }

  next();
};

app.use("/WholeEarthSatelliteImage", validateApiKey, WholeEarthSatelliteImage);
app.use("/AircraftOverhead", validateApiKey, AircraftOverhead);

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
