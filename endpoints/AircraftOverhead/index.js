import express from "express";

const router = express.Router();

// Fetch Aircraft data from ADSB API
const fetchAircraftData = async () => {
  const FCC_STUDIO_LAT = process.env.FCC_STUDIO_LAT;
  const FCC_STUDIO_LON = process.env.FCC_STUDIO_LON;

  if (!FCC_STUDIO_LAT || !FCC_STUDIO_LON) {
    throw new Error("FCC Studio coordinates are not configured");
  }

  const apiUrl = `https://api.adsb.lol/v2/lat/${FCC_STUDIO_LAT}/lon/${FCC_STUDIO_LON}/dist/100`;

  const response = await fetch(apiUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch Aircraft data: ${response.status}`);
  }

  const data = await response.json();
  return data;
};

// GET endpoint for AircraftOverhead - returns Aircraft data
router.get("/", async (req, res) => {
  try {
    const FCC_STUDIO_LAT = process.env.FCC_STUDIO_LAT;
    const FCC_STUDIO_LON = process.env.FCC_STUDIO_LON;

    const AircraftData = await fetchAircraftData();

    res.json({
      ...AircraftData,
      location: {
        lat: parseFloat(FCC_STUDIO_LAT),
        lng: parseFloat(FCC_STUDIO_LON)
      }
    });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching Aircraft data",
      error: error.message
    });
  }
});

export default router;
