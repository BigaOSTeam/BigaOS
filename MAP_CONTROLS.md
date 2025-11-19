# Map Controls - Pan & Recenter

## What Changed

The map no longer auto-centers continuously! You can now pan around freely and recenter when needed, just like Google Maps.

## How It Works

### Auto-Centering Behavior

**Initial State:**
- ✅ Auto-center is **ON** by default
- Map follows your boat's position automatically
- Button shows **blue** (active)

**When You Pan:**
- ❌ Auto-center **turns OFF** automatically
- You can explore the map freely
- Button turns **dark gray** (inactive)
- Boat keeps moving, but map stays where you put it

**Recenter Anytime:**
- 🎯 Click the **target button** (bottom-right)
- Auto-center turns **back ON**
- Map jumps to current boat position
- Button turns **blue** again

## Visual Indicators

**Recenter Button** (bottom-right corner):

```
🔵 Blue button with blue center = Auto-centering ON
   (Map is following boat)

⚫ Dark button with white center = Auto-centering OFF
   (You're free to pan around)
```

**Hover Effect:**
- Button slightly enlarges when you hover
- Smooth animation

**Tooltip:**
- Hover to see current state
- "Auto-centering ON" or "Click to recenter on boat"

## Usage Examples

### Scenario 1: Check Anchorage Ahead
```
1. See potential anchorage on map
2. Pan/drag to explore the area
3. Auto-center turns off automatically
4. Zoom in to check depth contours
5. Click recenter button to return to boat
6. Auto-center turns back on
```

### Scenario 2: Plan Route
```
1. Pan ahead on your planned route
2. Check navigation marks and hazards
3. Boat keeps moving while you explore
4. Click recenter when ready
5. Back to tracking boat position
```

### Scenario 3: Quick Recenter
```
1. Lost track of boat position
2. Just click the target button
3. Instantly back to boat
4. Auto-center resumes
```

## Button Location

The recenter button is positioned at:
- **Bottom-right** corner of map
- **Above** the map layer legend
- **Below** the info panel
- Easy thumb reach on tablets/phones

## Keyboard Shortcuts (Future)

Planned for future versions:
- `C` key = Toggle auto-center
- `Space` = Recenter on boat
- Arrow keys = Pan map

## Technical Details

### Auto-Center Logic

**Turns OFF when:**
- User drags/pans the map
- User clicks and moves map
- Any manual map interaction

**Turns ON when:**
- User clicks recenter button
- App first loads (default state)

**Stays ON when:**
- Zooming (zoom doesn't disable auto-center)
- Clicking boat marker
- Opening popups

### Position Updates

Even with auto-center OFF:
- ✅ Boat marker still updates position
- ✅ Heading still rotates
- ✅ Info panel still updates
- ✅ You can still see boat moving (if in view)
- ❌ Map just doesn't follow it

## Mobile Gestures

**One Finger:**
- Drag = Pan map (disables auto-center)

**Two Fingers:**
- Pinch = Zoom (keeps auto-center state)
- Drag = Pan map (disables auto-center)

**Tap:**
- Recenter button = Toggle auto-center

## Tips

1. **Leave auto-center ON while navigating**
   - Best for active sailing/motoring
   - Always see where you are

2. **Turn OFF to explore ahead**
   - Planning routes
   - Checking destinations
   - Examining hazards

3. **Use recenter frequently**
   - Quick way to get bearings
   - Don't lose track of boat
   - One-tap return

4. **Watch the button color**
   - Blue = following boat
   - Gray = free exploration
   - Always know current mode

## Comparison to Google Maps

Our implementation matches Google Maps behavior:

| Action | Google Maps | Boat OS |
|--------|-------------|---------|
| Auto-center on start | ✅ | ✅ |
| Pan disables auto-center | ✅ | ✅ |
| Recenter button | ✅ | ✅ |
| Visual indicator (blue) | ✅ | ✅ |
| Hover animation | ✅ | ✅ |
| Tooltip | ✅ | ✅ |

## Future Enhancements

Planned improvements:
- [ ] Compass mode (map rotates with heading)
- [ ] North-up mode toggle
- [ ] Heading-up mode (boat always points up)
- [ ] Auto-recenter after X seconds of no interaction
- [ ] Smooth animation when recentering
- [ ] Remember preference (local storage)

## Troubleshooting

**Button not visible?**
- Check map is open (not dashboard)
- Look bottom-right corner
- May be hidden behind info panel on small screens

**Auto-center won't turn off?**
- Make sure you're dragging the map
- Try panning more than a few pixels
- Check browser console for errors

**Can't recenter?**
- Click the button directly
- Check GPS data is updating
- Verify WebSocket connection (green indicator)

**Button stays gray?**
- That's normal if you panned
- Click it once to recenter
- Should turn blue

## Code Reference

**Component:** `client/src/components/navigation/ChartView.tsx`

**Key Functions:**
- `handleRecenter()` - Recenter and enable auto-center
- `handleMapDrag()` - Disable auto-center on pan
- `MapController` - Manages auto-center logic

**State:**
- `autoCenter` - Boolean state (true/false)
- Controlled by user interaction
- Visual feedback via button styling

---

**Status**: ✅ Fully implemented and working
**Like**: Google Maps location button
**Benefit**: Pan freely, recenter anytime!
