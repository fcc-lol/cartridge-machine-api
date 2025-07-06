import express from "express";

const router = express.Router();

// Fetch airplane data from ADSB API
const fetchAirplaneData = async () => {
  const FCC_STUDIO_LAT = process.env.FCC_STUDIO_LAT;
  const FCC_STUDIO_LON = process.env.FCC_STUDIO_LON;

  if (!FCC_STUDIO_LAT || !FCC_STUDIO_LON) {
    throw new Error("FCC Studio coordinates are not configured");
  }

  const apiUrl = `https://api.adsb.lol/v2/lat/${FCC_STUDIO_LAT}/lon/${FCC_STUDIO_LON}/dist/100`;

  const response = await fetch(apiUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch airplane data: ${response.status}`);
  }

  const data = await response.json();
  return data;
};

// GET endpoint for AirplanesOverhead - returns airplane data
router.get("/", async (req, res) => {
  try {
    const airplaneData = await fetchAirplaneData();
    res.json(airplaneData);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching airplane data",
      error: error.message
    });
  }
});

export default router;
