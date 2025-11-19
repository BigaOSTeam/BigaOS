# OpenSeaMap Navigation Feature

## What Was Added

A complete nautical chart integration using **OpenSeaMap** with real-time boat position and heading display.

## Features

✅ **OpenSeaMap Integration**
- Base layer: OpenStreetMap
- Nautical overlay: OpenSeaMap (buoys, depth contours, navigation marks)
- Seamless layer blending

✅ **Real-Time Boat Position**
- Live GPS position from sensor data
- Updates via WebSocket (every second)
- Smooth position tracking

✅ **Heading Indicator**
- Custom boat icon that rotates with compass heading
- Red dot shows bow direction
- Blue triangle shows boat hull

✅ **Navigation Info Panel**
- Current heading (HDG)
- Speed over ground (SPD)
- Depth below transducer (color-coded)
- GPS coordinates
- Always visible overlay

✅ **Interactive Map**
- Zoom in/out
- Pan around
- Click boat marker for details popup
- Auto-centering on boat position

## Installation

### Step 1: Install New Dependencies

From the `client/` directory:

```bash
cd client
npm install
```

This will install:
- `leaflet` - Map library
- `react-leaflet` - React wrapper for Leaflet
- `@types/leaflet` - TypeScript types

### Step 2: Restart the Client

Stop the client dev server (Ctrl+C) and restart:

```bash
npm run dev
```

## Usage

### Accessing the Map

1. **From Dashboard**: Click the **🗺️ Chart** button in the top right
2. **Full-Screen Map**: Opens in full-screen mode
3. **Return to Dashboard**: Click **← Back to Dashboard** button

### Map Controls

**Zoom:**
- `+` button (top left) - Zoom in
- `-` button (top left) - Zoom out
- Mouse wheel - Zoom
- Pinch gesture (mobile) - Zoom

**Pan:**
- Click and drag
- Two-finger drag (mobile)

**Boat Info:**
- Click the boat marker
- Popup shows: Position, Heading, Speed

### What You'll See

**Boat Marker:**
- Blue triangle (boat hull)
- Red dot (bow/front)
- Rotates with compass heading in real-time

**Map Layers:**
- Streets, coastlines (base layer)
- Nautical marks, buoys, depth contours (OpenSeaMap overlay)

**Info Panel (Top Right):**
- HDG: Current heading in degrees
- SPD: Speed over ground in knots
- DEPTH: Water depth in meters (color-coded by safety)
  - 🔴 Red: < 2m (very shallow - danger!)
  - 🟠 Orange: 2-5m (shallow - caution)
  - 🟢 Green: 5-10m (safe depth)
  - 🔵 Blue: > 10m (deep water)
- GPS: Latitude/Longitude coordinates

**Legend (Bottom Left):**
- Shows active map layers

## Technical Details

### Components Created

1. **ChartView.tsx** (`client/src/components/navigation/ChartView.tsx`)
   - Core map component with Leaflet
   - Custom boat icon with heading rotation
   - OpenSeaMap tile layers
   - Auto-centering logic

2. **MapPage.tsx** (`client/src/components/navigation/MapPage.tsx`)
   - Full-page map view
   - WebSocket integration for live updates
   - Header with navigation

### Data Flow

```
Dummy Data Service → WebSocket → MapPage → ChartView → Leaflet Map
                                     ↓
                              Updates Position
                              Updates Heading
```

### Map Tile Sources

**Base Layer (OpenStreetMap):**
```
https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
```

**Nautical Overlay (OpenSeaMap):**
```
https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png
```

## Customization

### Change Initial Zoom Level

Edit `ChartView.tsx` line ~55:
```typescript
zoom={14}  // Change to 10-18 (higher = more zoomed in)
```

### Disable Auto-Centering

Remove or comment out the `<MapController>` component in `ChartView.tsx`.

### Change Boat Icon

Edit the SVG in `createBoatIcon()` function in `ChartView.tsx`:
```typescript
const svgIcon = `
  <svg width="40" height="40" viewBox="0 0 40 40">
    <!-- Customize your boat icon here -->
  </svg>
`;
```

### Add Waypoints or Routes

In `ChartView.tsx`, add more `<Marker>` components:
```typescript
<Marker position={[lat, lon]}>
  <Popup>Waypoint Name</Popup>
</Marker>
```

## Real Hardware Integration

When you move to the Raspberry Pi with real sensors:

1. **GPS Position** - Will come from U-blox NEO-M8N via SignalK
2. **Heading** - Will come from Bosch BNO055 IMU via SignalK
3. **Speed** - Will come from GPS or speed transducer via SignalK

The map will automatically use real data - no code changes needed!

## Troubleshooting

### Map Tiles Not Loading

**Issue:** Gray tiles or loading forever

**Solutions:**
- Check internet connection (tiles are loaded from internet)
- Try refreshing the page
- Check browser console for errors
- Verify firewall isn't blocking tile servers

### Boat Icon Not Rotating

**Issue:** Boat icon stays in one direction

**Solutions:**
- Check compass data is updating (view in dashboard)
- Verify WebSocket connection (green indicator)
- Check browser console for errors

### Map Not Centering on Boat

**Issue:** Boat drifts off screen

**Solutions:**
- This is normal if moving fast - map updates every second
- Zoom out for wider view
- Click and drag to manually center

### Poor Performance

**Issue:** Map is laggy or slow

**Solutions:**
- Close other browser tabs
- Reduce zoom level (show less detail)
- Check if dummy data is generating too fast
- Disable browser extensions

## Future Enhancements

Ideas for when you're on the Raspberry Pi:

1. **Track History** - Show trail of where you've been
2. **Waypoints** - Add/save waypoints
3. **Route Planning** - Create and follow routes
4. **Anchor Alarm Circle** - Show anchor drag radius
5. **AIS Integration** - Show nearby vessels (if AIS receiver added)
6. **Weather Overlay** - Wind, waves, precipitation
7. **Depth Contours** - Highlight shallow areas
8. **Night Mode** - Dark map tiles for night sailing

## Resources

- **OpenSeaMap**: https://www.openseamap.org/
- **Leaflet Docs**: https://leafletjs.com/
- **React-Leaflet**: https://react-leaflet.js.org/

---

**Status**: ✅ Fully functional with dummy data
**Next**: Test on Raspberry Pi with real GPS/compass data!
