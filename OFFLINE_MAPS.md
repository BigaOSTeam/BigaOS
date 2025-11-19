# Offline Map Capabilities for Boat OS

## Overview

When sailing, you often won't have internet connectivity. Here's how to enable offline maps for Boat OS so you can navigate even when offshore.

## Current Status

**⚠️ Currently:** Maps require internet connection to load tiles from OpenStreetMap and OpenSeaMap servers.

**✅ Solution:** Pre-cache map tiles for your sailing area before you leave the dock!

## Offline Strategy Options

### Option 1: Browser Cache (Simple - Works Now!)

The browser automatically caches map tiles as you view them. This provides basic offline capability.

**How to Pre-Cache Your Sailing Area:**

1. **Before leaving dock** (with WiFi/internet):
   - Open the map view
   - Pan around your entire sailing area
   - Zoom to all levels you'll need (12-17 recommended)
   - The browser will cache these tiles

2. **Coverage Tips:**
   - Zoom level 17 = Very detailed (harbor)
   - Zoom level 15 = Moderate detail (bay)
   - Zoom level 13 = Overview (region)
   - Pre-cache all three levels for best results

3. **Browser Storage:**
   - Modern browsers cache ~50-500MB per site
   - Covers roughly 10-50 square miles depending on zoom
   - Tiles expire after 7-30 days

**Limitations:**
- ❌ Not guaranteed to work offline
- ❌ Tiles can be evicted by browser
- ❌ Manual pre-caching required
- ❌ No control over what's cached

### Option 2: Service Worker + IndexedDB (Better - Requires Setup)

Use a Progressive Web App (PWA) with service worker to cache tiles reliably.

**Implementation Steps:**

#### Step 1: Create Service Worker

Create `client/public/sw.js`:

```javascript
const CACHE_NAME = 'boat-os-maps-v1';
const TILE_CACHE = 'boat-os-tiles-v1';

// Cache application files
const APP_FILES = [
  '/',
  '/index.html',
  '/assets/index.js',
  '/assets/index.css'
];

// Install service worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
  );
});

// Intercept map tile requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Cache OpenStreetMap tiles
  if (url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(TILE_CACHE).then(cache => {
        return cache.match(event.request).then(response => {
          return response || fetch(event.request).then(fetchResponse => {
            cache.put(event.request, fetchResponse.clone());
            return fetchResponse;
          });
        });
      })
    );
  }

  // Cache OpenSeaMap tiles
  else if (url.hostname.includes('openseamap.org')) {
    event.respondWith(
      caches.open(TILE_CACHE).then(cache => {
        return cache.match(event.request).then(response => {
          return response || fetch(event.request).then(fetchResponse => {
            cache.put(event.request, fetchResponse.clone());
            return fetchResponse;
          });
        });
      })
    );
  }

  // Default: network first, fallback to cache
  else {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});
```

#### Step 2: Register Service Worker

In `client/src/main.tsx`, add:

```typescript
// Register service worker for offline maps
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('SW registered:', registration);
      })
      .catch(error => {
        console.log('SW registration failed:', error);
      });
  });
}
```

#### Step 3: Add PWA Manifest

Update `client/public/manifest.json`:

```json
{
  "name": "Boat OS",
  "short_name": "Boat OS",
  "description": "Intelligent Boat Automation System",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a1929",
  "theme_color": "#1976d2",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

**Benefits:**
- ✅ Reliable offline access
- ✅ Automatic caching as you navigate
- ✅ 100MB+ storage available
- ✅ Install as app on device
- ⚠️ Requires setup

### Option 3: Pre-Download Tiles (Best - For Raspberry Pi)

Download and host map tiles locally on the Raspberry Pi.

**Implementation:**

#### Step 1: Download Tiles for Your Area

Use `download-osm-tiles` tool:

```bash
# On your computer (before deploying to Pi)
npm install -g download-osm-tiles

# Download tiles for your sailing area
download-osm-tiles \
  --lat 47.6062 \
  --lon -122.3321 \
  --radius 25000 \
  --zoom 10-17 \
  --output ./tiles/osm

# This creates a local tile cache
```

#### Step 2: Serve Tiles Locally

Add to your Express server (`server/src/index.ts`):

```typescript
import express from 'express';
import path from 'path';

// Serve cached map tiles
app.use('/tiles/osm', express.static(path.join(__dirname, '../../tiles/osm')));
app.use('/tiles/seamark', express.static(path.join(__dirname, '../../tiles/seamark')));
```

#### Step 3: Update Tile URLs

In `ChartView.tsx`, change tile URLs to local:

```typescript
<TileLayer
  url="http://localhost:3000/tiles/osm/{z}/{x}/{y}.png"
  attribution='&copy; OpenStreetMap'
/>

<TileLayer
  url="http://localhost:3000/tiles/seamark/{z}/{x}/{y}.png"
  attribution='&copy; OpenSeaMap'
/>
```

**Benefits:**
- ✅ 100% offline - no internet needed
- ✅ Fast loading (local network)
- ✅ Complete control
- ✅ No storage limits
- ⚠️ Large storage needed (5-50GB depending on area)
- ⚠️ Setup complexity

## Recommended Approach

**For Development (Now):**
→ Use **Option 1** (Browser Cache) - Simple, works immediately

**For Raspberry Pi Deployment:**
→ Use **Option 2** (Service Worker) + **Option 3** (Local Tiles)

### Why Both?

1. **Service Worker** = Handles app files + fallback caching
2. **Local Tiles** = Serves pre-downloaded map tiles
3. Together = Complete offline capability

## Storage Requirements

**Tile Storage Estimates:**

| Area Size | Zoom Levels | Storage Needed |
|-----------|-------------|----------------|
| Harbor (1 mile²) | 15-18 | ~500 MB |
| Bay (10 miles²) | 13-17 | ~2 GB |
| Region (50 miles²) | 12-16 | ~10 GB |
| Coast (200 miles²) | 10-15 | ~30 GB |

**Rule of Thumb:**
- Each zoom level = 4× more tiles than previous
- OpenSeaMap overlay = +50% storage
- Pre-download only areas you'll actually sail

## Implementation Script

Here's a complete script for Raspberry Pi deployment:

```bash
#!/bin/bash
# setup-offline-maps.sh

echo "🗺️  Setting up offline maps for Boat OS"
echo "========================================"

# 1. Install tile downloader
npm install -g download-osm-tiles

# 2. Download your sailing area
# EDIT THESE COORDINATES FOR YOUR AREA!
LAT=47.6062
LON=-122.3321
RADIUS=25000  # meters (25km)

echo "Downloading tiles for ${LAT}, ${LON} (${RADIUS}m radius)..."

mkdir -p tiles/osm tiles/seamark

# Download OpenStreetMap base tiles
download-osm-tiles \
  --lat $LAT \
  --lon $LON \
  --radius $RADIUS \
  --zoom 10-17 \
  --output ./tiles/osm

echo "✅ Base tiles downloaded"

# Download OpenSeaMap nautical overlay
# (OpenSeaMap uses same tile structure)
download-osm-tiles \
  --lat $LAT \
  --lon $LON \
  --radius $RADIUS \
  --zoom 10-17 \
  --output ./tiles/seamark \
  --url "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"

echo "✅ Nautical overlay downloaded"
echo ""
echo "📊 Storage used:"
du -sh tiles/

echo ""
echo "✅ Offline maps ready!"
echo "Edit server/src/index.ts to serve these tiles"
```

## Testing Offline Mode

### Test Service Worker

1. Open browser DevTools
2. Go to Application → Service Workers
3. Check "Offline" checkbox
4. Navigate map - should work!

### Test Local Tiles

1. Disconnect internet
2. Open map
3. Tiles should load from local server
4. No "tile failed to load" errors

## Depth Contours

OpenSeaMap includes depth contours, but they're sparse. For better depth data:

### Option A: Use ENC Charts

Electronic Navigational Charts (NOAA, UKHO) have detailed depth data.

**Note:** Requires conversion to tile format - complex setup.

### Option B: Use Chart Plotter Integration

If you have a dedicated chart plotter, Boat OS can overlay position on that.

**Recommended:** Use Boat OS for automation, chart plotter for navigation.

## GPS Without Internet

Your GPS works offline! It doesn't need internet.

**What Works Offline:**
- ✅ GPS position (satellites, not internet)
- ✅ Compass heading (IMU sensor)
- ✅ Depth sounder (transducer)
- ✅ Speed log (transducer or GPS)
- ✅ All local sensor data

**What Needs Internet:**
- ❌ Weather forecasts (cached last fetch)
- ❌ Map tiles (unless pre-cached)
- ❌ Remote monitoring

## Best Practices

1. **Always pre-cache your area before leaving dock**
2. **Download multiple zoom levels (12-17)**
3. **Test offline mode before relying on it**
4. **Update tiles periodically** (charts change!)
5. **Keep paper charts as backup** (safety first!)

## Alternative: Use MBTiles

For advanced users, convert tiles to `.mbtiles` format:

```bash
# Compact tile storage format
npm install -g mbutil

# Convert folder to mbtiles
mb-util tiles/osm/ area.mbtiles

# Serve mbtiles with mbtiles-server
npm install -g @mapbox/mbtiles-server
mbtiles-server area.mbtiles
```

Benefits: Single file, compressed, faster serving.

## Conclusion

**Quick Start (Now):**
- Use browser cache - just pan around your area with internet

**Production (Raspberry Pi):**
- Implement Service Worker (Option 2)
- Download local tiles (Option 3)
- Store on Pi's microSD card
- Total offline capability!

**Remember:** Depth data shown on map is from your depth sounder in real-time, not from charts. The OpenSeaMap depth contours are for reference only.

---

**Status**: Browser caching works now, full offline ready for Pi deployment
**Storage**: Budget 10-30GB for typical sailing area
**Safety**: Always carry paper charts and traditional navigation tools!
