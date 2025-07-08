import express from "express";
import fakeAircraftData from "./demo.json" assert { type: "json" };

const router = express.Router();

const RADIUS = 25;
const RADIUS_UNIT = "nm";

// Center coordinates for demo mode
const DEMO_CENTER_LAT = 40.73061;
const DEMO_CENTER_LON = -73.935242;

// Store initial aircraft data and last request time for demo mode
let demoAircraftData = null;
let lastDemoRequestTime = null;

// Function to calculate distance between two lat/lon points in nautical miles
const calculateDistanceNM = (lat1, lon1, lat2, lon2) => {
  const R = 3440.065; // Earth's radius in nautical miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Function to update aircraft positions based on speed and heading
const updateAircraftPositions = (aircraftData, elapsedTimeSeconds) => {
  const updatedAircraft = aircraftData.map((aircraft) => {
    if (!aircraft.speed || !aircraft.heading) {
      return aircraft; // Skip if no speed or heading data
    }

    // Convert speed from knots to nautical miles per second
    const speedNmPerSecond = aircraft.speed / 3600;

    // Calculate distance traveled in nautical miles
    const distanceTraveled = speedNmPerSecond * elapsedTimeSeconds;

    // Convert heading to radians
    const headingRadians = (aircraft.heading * Math.PI) / 180;

    // Calculate new position
    // 1 nautical mile = 1/60 degree of latitude
    const deltaLat = (distanceTraveled * Math.cos(headingRadians)) / 60;
    const deltaLon =
      (distanceTraveled * Math.sin(headingRadians)) /
      (60 * Math.cos((aircraft.lat * Math.PI) / 180));

    return {
      ...aircraft,
      lat: aircraft.lat + deltaLat,
      lon: aircraft.lon + deltaLon
    };
  });

  // Filter out aircraft that have moved outside the radius
  return updatedAircraft.filter((aircraft) => {
    const distance = calculateDistanceNM(
      DEMO_CENTER_LAT,
      DEMO_CENTER_LON,
      aircraft.lat,
      aircraft.lon
    );
    return distance <= RADIUS;
  });
};

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
    // Check if demo mode is enabled
    if (req.demoMode === true) {
      const currentTime = new Date().getTime();

      // Initialize demo data on first request or if too much time has passed
      if (!demoAircraftData || !lastDemoRequestTime) {
        demoAircraftData = JSON.parse(JSON.stringify(fakeAircraftData)); // Deep copy to avoid mutating original
        lastDemoRequestTime = currentTime;
      }

      const elapsedTimeSeconds = (currentTime - lastDemoRequestTime) / 1000;

      // Update aircraft positions based on elapsed time
      if (elapsedTimeSeconds > 0) {
        demoAircraftData = updateAircraftPositions(
          demoAircraftData,
          elapsedTimeSeconds
        );
        lastDemoRequestTime = currentTime;
      }

      return res.json({
        aircraft: demoAircraftData,
        metadata: {
          timestamp: new Date().toISOString(),
          count: demoAircraftData.length,
          location: {
            lat: DEMO_CENTER_LAT,
            lng: DEMO_CENTER_LON
          },
          radius: {
            value: RADIUS,
            unit: RADIUS_UNIT
          }
        }
      });
    }

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
