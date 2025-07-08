import express from "express";

const router = express.Router();

const RADIUS = 25;
const RADIUS_UNIT = "nm";

// Fetch Aircraft data from ADSB API
const fetchAircraftData = async () => {
  const FCC_STUDIO_LAT = process.env.FCC_STUDIO_LAT;
  const FCC_STUDIO_LON = process.env.FCC_STUDIO_LON;

  if (!FCC_STUDIO_LAT || !FCC_STUDIO_LON) {
    throw new Error("FCC Studio coordinates are not configured");
  }

  const apiUrl = `https://opendata.adsb.fi/api/v2/lat/${FCC_STUDIO_LAT}/lon/${FCC_STUDIO_LON}/dist/${RADIUS}`;

  const response = await fetch(apiUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch Aircraft data: ${response.status}`);
  }

  const data = await response.json();

  const parseCategory = (category) => {
    if (!category) return "unknown";

    const categoryMap = {
      // Fixed-wing aircraft
      A0: "unknown",
      A1: "small-plane",
      A2: "medium-plane",
      A3: "large-plane",
      A4: "jumbo-jet",
      A5: "heavy-aircraft",
      A6: "fighter-jet",

      // Rotorcraft
      A7: "helicopter",

      // Other categories
      B0: "unknown",
      B1: "glider",
      B2: "balloon",
      B3: "parachute",
      B4: "ultralight",
      B5: "unknown",
      B6: "drone",
      B7: "rocket",

      // Surface vehicles
      C0: "ground-vehicle",
      C1: "ground-vehicle",
      C2: "ground-vehicle",
      C3: "ground-vehicle"
    };

    return categoryMap[category] || "unknown";
  };

  // Filter to only return required fields and exclude ground/negative altitude
  const filteredData =
    data.aircraft
      ?.filter((aircraft) => {
        const altitude = aircraft.alt_baro;
        // Filter out "ground" or negative altitude values
        return (
          altitude !== "ground" &&
          altitude !== null &&
          altitude !== undefined &&
          altitude > 0
        );
      })
      .map((aircraft) => ({
        id: aircraft.hex,
        lat: aircraft.lat,
        lon: aircraft.lon,
        flight: aircraft.flight?.trim(),
        type: aircraft.t,
        category: parseCategory(aircraft.category),
        altitude: aircraft.alt_baro,
        speed: aircraft.gs,
        heading: aircraft.track
      })) || [];

  return filteredData;
};

// GET endpoint for AircraftOverhead - returns Aircraft data
router.get("/", async (req, res) => {
  try {
    const FCC_STUDIO_LAT = process.env.FCC_STUDIO_LAT;
    const FCC_STUDIO_LON = process.env.FCC_STUDIO_LON;

    const aircraftData = await fetchAircraftData();

    res.json({
      aircraft: aircraftData,
      metadata: {
        timestamp: new Date().toISOString(),
        count: aircraftData.length,
        location: {
          lat: parseFloat(FCC_STUDIO_LAT),
          lng: parseFloat(FCC_STUDIO_LON)
        },
        radius: {
          value: RADIUS,
          unit: RADIUS_UNIT
        }
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
