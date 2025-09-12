import express from "express";

const router = express.Router();

// Demo data for when in demo mode
const demoSatelliteData = {
  info: {
    category: "ANY",
    transactionscount: 34,
    satcount: 32
  },
  above: [
    {
      satid: 13890,
      satname: "MOLNIYA 1-56",
      intDesignator: "1983-019A",
      launchDate: "1983-03-16",
      satlat: 56.4963,
      satlng: -10.8396,
      satalt: 34952.2755
    },
    {
      satid: 15398,
      satname: "COSMOS 1610",
      intDesignator: "1984-118A",
      launchDate: "1984-11-15",
      satlat: 48.5227,
      satlng: 3.963,
      satalt: 1011.6526
    },
    {
      satid: 23907,
      satname: "USA 120",
      intDesignator: "1996-029B",
      launchDate: "1996-05-12",
      satlat: 48.7406,
      satlng: 2.3055,
      satalt: 910.2093
    },
    {
      satid: 45387,
      satname: "STARLINK-1274",
      intDesignator: "2020-019AD",
      launchDate: "2020-03-18",
      satlat: 47.859,
      satlng: 2.3022,
      satalt: 498.4995
    },
    {
      satid: 48214,
      satname: "ONEWEB-0218",
      intDesignator: "2021-031E",
      launchDate: "2021-04-25",
      satlat: 49.634,
      satlng: 4.4368,
      satalt: 1213.4881
    }
  ]
};

// Constants for satellite search radius
const SATELLITE_RADIUS_KM = 5000; // kilometers for metadata
const RADIUS_UNIT = "km";

// Convert kilometers to degrees (approximately 111 km per degree)
const kmToDegrees = (km) => km / 111;
const SATELLITE_RADIUS_DEGREES = kmToDegrees(SATELLITE_RADIUS_KM);

// Fetch Satellite data from space-api.danmade.app
const fetchSatelliteData = async () => {
  const FCC_STUDIO_LAT = process.env.FCC_STUDIO_LAT;
  const FCC_STUDIO_LON = process.env.FCC_STUDIO_LON;

  if (!FCC_STUDIO_LAT || !FCC_STUDIO_LON) {
    throw new Error("FCC Studio coordinates are not configured");
  }

  const apiUrl = `https://space-api.danmade.app/satellites-above?lat=${FCC_STUDIO_LAT}&lon=${FCC_STUDIO_LON}&radius=${SATELLITE_RADIUS_DEGREES}`;

  const response = await fetch(apiUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch Satellite data: ${response.status}`);
  }

  const data = await response.json();
  return data;
};

// GET endpoint for SatellitesOverhead - returns satellite data
router.get("/", async (req, res) => {
  try {
    // Check if demo mode is enabled
    if (req.demoMode === true) {
      return res.json({
        satellites: demoSatelliteData,
        metadata: {
          timestamp: new Date().toISOString(),
          count: demoSatelliteData.info.satcount,
          location: {
            lat: "DEMO_LAT",
            lng: "DEMO_LON"
          },
          radius: {
            value: SATELLITE_RADIUS_KM,
            unit: RADIUS_UNIT
          },
          source: "demo"
        }
      });
    }

    const FCC_STUDIO_LAT = process.env.FCC_STUDIO_LAT;
    const FCC_STUDIO_LON = process.env.FCC_STUDIO_LON;

    const satelliteData = await fetchSatelliteData();

    res.json({
      satellites: satelliteData,
      metadata: {
        timestamp: new Date().toISOString(),
        count: satelliteData.info.satcount,
        location: {
          lat: FCC_STUDIO_LAT,
          lng: FCC_STUDIO_LON
        },
        radius: {
          value: SATELLITE_RADIUS_KM,
          unit: RADIUS_UNIT
        },
        source: "space-api.danmade.app"
      }
    });
  } catch (error) {
    console.error("Error fetching satellite data:", error);
    res.status(500).json({
      message: "Error fetching satellite data",
      error: error.message
    });
  }
});

export default router;
