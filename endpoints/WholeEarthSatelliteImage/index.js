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

// Read cached data if it exists (always return data if available, regardless of age)
const getCachedData = () => {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      return null;
    }

    const cachedData = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    const now = Date.now();

    // Verify that all cached images still exist
    const imagesExist = cachedData.data.every((img) =>
      fs.existsSync(path.join(CACHE_IMAGES_DIR, `${img.image}.png`))
    );

    if (imagesExist) {
      return {
        data: cachedData.data,
        isStale: now - cachedData.timestamp >= CACHE_DURATION
      };
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

// Download and cache an image with temporary filename
const downloadAndCacheImage = async (
  imageUrl,
  originalFilename,
  tempFilename
) => {
  try {
    // Ensure cache directory exists before writing
    ensureCacheDir();

    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const tempImagePath = path.join(CACHE_IMAGES_DIR, tempFilename);
    fs.writeFileSync(tempImagePath, Buffer.from(buffer));

    return { tempPath: tempImagePath, originalFilename };
  } catch (error) {
    console.error(`Error downloading image ${originalFilename}:`, error);
    throw error;
  }
};

// Delete old images and rename temp files to final names
const finalizeCacheUpdate = (downloadedImages) => {
  try {
    if (fs.existsSync(CACHE_IMAGES_DIR)) {
      // Step 1: Delete only old files (not temp files)
      const files = fs.readdirSync(CACHE_IMAGES_DIR);
      const tempFileNames = downloadedImages.map((img) =>
        path.basename(img.tempPath)
      );
      const oldFiles = files.filter((file) => !tempFileNames.includes(file));

      oldFiles.forEach((file) => {
        fs.unlinkSync(path.join(CACHE_IMAGES_DIR, file));
      });
      console.log(`Deleted ${oldFiles.length} old cached images`);

      // Step 2: Rename temp files to their final names
      downloadedImages.forEach(({ tempPath, finalFilename }) => {
        const finalPath = path.join(CACHE_IMAGES_DIR, finalFilename);
        fs.renameSync(tempPath, finalPath);
      });
      console.log(
        `Renamed ${downloadedImages.length} temp files to final names`
      );
    }
  } catch (error) {
    console.error("Error finalizing cache update:", error);
  }
};

// Background task to refresh cache
let isRefreshing = false;
const refreshCacheInBackground = async () => {
  if (isRefreshing) {
    console.log("Cache refresh already in progress, skipping...");
    return;
  }

  isRefreshing = true;
  console.log("Starting background cache refresh...");

  try {
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

    // Step 1: Identify which old images to delete (but don't delete them yet)
    const oldImageFiles = fs.existsSync(CACHE_IMAGES_DIR)
      ? fs.readdirSync(CACHE_IMAGES_DIR)
      : [];
    console.log(
      `Identified ${oldImageFiles.length} old images to delete later`
    );

    // Step 2: Download and save all the new images with temporary filenames
    const imagesWithUrls = [];
    const successfullyDownloadedIds = [];
    const downloadedImages = []; // Track temp files and their final names

    for (const img of data) {
      try {
        // Parse date from the image date string (e.g., "2025-07-02 00:13:03")
        const date = new Date(img.date);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");

        // Construct NASA image URL
        const nasaImageUrl = `https://api.nasa.gov/EPIC/archive/natural/${year}/${month}/${day}/png/${img.image}.png?api_key=${NASA_API_KEY}`;

        // Download and cache the image with temporary filename
        const originalFilename = `${img.image}.png`;
        const tempFilename = `temp_${Date.now()}_${img.image}.png`;
        const downloadResult = await downloadAndCacheImage(
          nasaImageUrl,
          originalFilename,
          tempFilename
        );

        console.log("Downloading ", img.image, "as", tempFilename);

        // Track successfully downloaded images
        successfullyDownloadedIds.push(img.image);
        downloadedImages.push({
          tempPath: downloadResult.tempPath,
          finalFilename: originalFilename
        });

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

    // Step 3: Delete all old images and rename temp files to final names
    if (successfullyDownloadedIds.length > 0) {
      finalizeCacheUpdate(downloadedImages);

      // Save new data to cache
      saveToCache(imagesWithUrls);

      console.log("Background cache refresh completed successfully");
    } else {
      console.log(
        "No images were successfully downloaded, keeping existing cache"
      );
    }
  } catch (error) {
    console.error("Background cache refresh failed:", error);
    // Don't clear existing cache if refresh fails - keep old images available
  } finally {
    isRefreshing = false;
  }
};

// Fetch fresh data from NASA API and cache images (synchronous version for initial load)
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

      // Download and cache the image (synchronous version uses direct filenames)
      const filename = `${img.image}.png`;
      await downloadAndCacheImage(nasaImageUrl, filename, filename);

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
    let cacheResult = getCachedData();
    console.log("cacheResult", cacheResult);

    if (!cacheResult) {
      // If demo mode is enabled, return empty array when no cache exists
      if (req.demoMode) {
        console.log("Demo mode: No cache available, returning empty array");
        return res.json([]);
      }

      // If no cache exists, we need to fetch synchronously
      try {
        const images = await fetchEarthImages();
        saveToCache(images);
        cacheResult = { data: images, isStale: false };
      } catch (error) {
        console.error("Error fetching fresh data:", error);
        // Return empty array if no cache and fetch fails
        cacheResult = { data: [], isStale: false };
      }
    } else {
      // Cache exists - return it immediately and check for stale cache in background
      console.log("Returning cached data immediately...");

      // If cache is stale, trigger background refresh (unless in demo mode)
      if (cacheResult.isStale && !req.demoMode) {
        console.log("Cache is stale, triggering background refresh...");
        setImmediate(() => refreshCacheInBackground());
      } else if (cacheResult.isStale && req.demoMode) {
        console.log(
          "Demo mode: Cache is stale but skipping background refresh"
        );
      }
    }

    // Return just the array of image IDs (from current cache) immediately
    const imageIds = cacheResult.data.map((img) => img.image);
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

// GET endpoint for clearing cache
router.get("/clear-cache", (req, res) => {
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
