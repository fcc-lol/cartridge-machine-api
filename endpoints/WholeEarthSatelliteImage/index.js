import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();

// Cache file paths (relative to this endpoint folder)
const ENDPOINT_DIR = path.dirname(import.meta.url.replace("file://", ""));
const CACHE_FILE = path.join(ENDPOINT_DIR, "cache", "earth-images.json");
const CACHE_IMAGES_DIR = path.join(ENDPOINT_DIR, "cache", "images");
const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours in milliseconds

// Ensure cache directories exist
const ensureCacheDir = () => {
  const cacheDir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  if (!fs.existsSync(CACHE_IMAGES_DIR)) {
    fs.mkdirSync(CACHE_IMAGES_DIR, { recursive: true });
  }
};

// Read cached data if it exists and is fresh
const getCachedData = () => {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      return null;
    }

    const cachedData = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    const now = Date.now();

    // Check if cache is still valid (less than 12 hours old)
    if (now - cachedData.timestamp < CACHE_DURATION) {
      // Verify that all cached images still exist
      const imagesExist = cachedData.data.every((img) =>
        fs.existsSync(path.join(CACHE_IMAGES_DIR, `${img.image}.png`))
      );

      if (imagesExist) {
        return cachedData.data;
      }
    }

    return null;
  } catch (error) {
    console.error("Error reading cache:", error);
    return null;
  }
};

// Save data to cache
const saveToCache = (data) => {
  try {
    ensureCacheDir();
    const cacheData = {
      timestamp: Date.now(),
      data: data
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2));
  } catch (error) {
    console.error("Error saving to cache:", error);
  }
};

// Download and cache an image
const downloadAndCacheImage = async (imageUrl, filename) => {
  try {
    // Ensure cache directory exists before writing
    ensureCacheDir();

    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const imagePath = path.join(CACHE_IMAGES_DIR, filename);
    fs.writeFileSync(imagePath, Buffer.from(buffer));

    return imagePath;
  } catch (error) {
    console.error(`Error downloading image ${filename}:`, error);
    throw error;
  }
};

// Fetch fresh data from NASA API and cache images
const fetchEarthImages = async () => {
  const NASA_API_KEY = process.env.NASA_API_KEY;

  if (!NASA_API_KEY) {
    throw new Error("NASA API key is not configured");
  }

  const response = await fetch(
    `https://api.nasa.gov/EPIC/api/natural/images?api_key=${NASA_API_KEY}`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch images: ${response.status}`);
  }

  const data = await response.json();

  if (data.length === 0) {
    throw new Error("No images available");
  }

  // Process images and download them
  const imagesWithUrls = [];

  for (const img of data) {
    try {
      // Parse date from the image date string (e.g., "2025-07-02 00:13:03")
      const date = new Date(img.date);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");

      // Construct NASA image URL
      const nasaImageUrl = `https://api.nasa.gov/EPIC/archive/natural/${year}/${month}/${day}/png/${img.image}.png?api_key=${NASA_API_KEY}`;

      // Download and cache the image
      const filename = `${img.image}.png`;
      await downloadAndCacheImage(nasaImageUrl, filename);

      // Add local URL to image object
      imagesWithUrls.push({
        ...img,
        imageUrl: `/WholeEarthSatelliteImage/image/${img.image}.png`,
        originalUrl: nasaImageUrl
      });
    } catch (error) {
      console.error(`Failed to process image ${img.image}:`, error);
      // Skip this image if download fails
    }
  }

  return imagesWithUrls;
};

// GET endpoint for WholeEarthSatelliteImage - returns array of image IDs
router.get("/", async (req, res) => {
  try {
    // Try to get cached data first
    let images = getCachedData();

    if (!images) {
      // Fetch fresh data from NASA API and cache images
      images = await fetchEarthImages();
      // Save to cache
      saveToCache(images);
    }

    // Return just the array of image IDs
    const imageIds = images.map((img) => img.image);
    res.json(imageIds);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching whole earth satellite image",
      error: error.message
    });
  }
});

// GET endpoint to serve cached images as files
router.get("/image/:filename", (req, res) => {
  try {
    const filename = req.params.filename;
    const imagePath = path.join(CACHE_IMAGES_DIR, filename);

    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({
        message: "Image not found",
        error: "The requested image is not available in cache"
      });
    }

    // Set appropriate headers for PNG image
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=43200"); // 12 hours cache
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

    // Stream the image file
    const imageStream = fs.createReadStream(imagePath);
    imageStream.on("error", (error) => {
      console.error("Error streaming image:", error);
      res.status(500).json({
        message: "Error streaming image",
        error: error.message
      });
    });

    imageStream.pipe(res);
  } catch (error) {
    res.status(500).json({
      message: "Error serving image",
      error: error.message
    });
  }
});

// POST endpoint for clearing cache
router.post("/clear-cache", (req, res) => {
  try {
    // Clear metadata cache
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
    }

    // Clear image cache
    if (fs.existsSync(CACHE_IMAGES_DIR)) {
      const files = fs.readdirSync(CACHE_IMAGES_DIR);
      files.forEach((file) => {
        fs.unlinkSync(path.join(CACHE_IMAGES_DIR, file));
      });
    }

    res.json({
      message: "Cache cleared successfully",
      status: "success"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error clearing cache",
      error: error.message
    });
  }
});

export default router;
