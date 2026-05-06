# Anchor Alarm

The anchor alarm watches the boat's position relative to where you dropped the anchor and warns you if the boat drifts outside the swing radius.

## What you need first

The anchor alarm uses your boat's actual numbers. Fill in **Settings → Vessel** before you anchor:

- **Length (LOA)**, **waterline length**, **freeboard** — drive the wind-load calculation.
- **Displacement** — affects windage estimate.
- **Total chain length**, **chain diameter**, **chain type** (galvanized or stainless steel) — drive the chain-weight and recommendations.

Those values feed into the catenary calculation, so the more accurate they are the more useful the recommendations.

## Dropping the anchor

When you're at your anchor spot:

1. Long-press the chart at your anchor position and pick **Set anchor** from the context menu — or use the dedicated **Anchor** action.
2. The **Anchor Alarm** dialog opens with a chain-length input, current depth, and a calculated **swing radius**.
3. Enter the chain you actually let out. The dialog visualises the catenary on the chart — the chain laid on the seabed in a darker colour, the suspended portion in a lighter one.
4. Tap **Activate** to arm the alarm.

While armed, BigaOS draws the swing circle around the anchor position and watches your GPS. If the boat moves outside the circle, the alarm fires.

## Swing radius — how it's calculated

The swing radius is the horizontal distance the boat can travel given how much chain is out and how deep the water is, plus the boat's own length:

> `swing_radius = sqrt(chain² − depth²) + boat_length / 2`

If the chain is shorter than the depth (impossible scope), the dialog refuses to activate.

## Chain-length recommendations

The dialog shows two target chain lengths for the current depth, driven by the **weather forecast** for the time you're planning to stay:

- **Min chain** — enough chain for the maximum sustained wind expected during your stay.
- **Recommended chain** — enough chain for the maximum gusts expected during your stay.

Both numbers, plus the underlying max-wind and max-gust the forecast is reporting, are shown right above the chain input. Pick the **Planned stay** duration (12 h / 24 h / 2 d / 3 d) and the recommendations recompute against the new horizon.

If the weather service is unreachable (no internet, weather disabled in Settings), the dialog falls back to three fixed thresholds — *minimum* at ~15 kt, *recommended* at ~25 kt, *storm* at ~45 kt.

The recommendations come from a calculation that combines:

- Wind force on the boat (`F = 0.5 × ρ × V² × A × Cd`, with windage estimated from your freeboard × waterline × hull factor).
- Chain weight per metre in water (galvanized vs stainless) using `weight ≈ k × diameter²` (k=0.020 for galvanized, 0.022 for stainless).
- The catenary equation `L = √(Y × (Y + 2a))` where `a = F / (m × g)`.
- A cross-check with the Yachting-Monthly rule `chain = wind × depth_factor + boat_length` (depth_factor 1.0 below 8 m, 1.5 for 8–15 m, 2.0 above 15 m).

The dialog colour-codes whether the chain you've entered meets each threshold — green when it does, orange or red when it doesn't.

If the chain you've entered is more than 90 % of your boat's **total chain** (from Vessel settings), the dialog warns you — letting out near-everything leaves no margin.

## See the math (and pick the formula)

**Tap the recommendation boxes** to open the **Chain calculation** details dialog. It shows:

- **Your vessel** — the LOA, waterline, freeboard, displacement, chain diameter and type that BigaOS is using, plus the derived windage area (m²) and chain weight per metre (kg/m).
- **Wind forecast** — the max wind and max gusts the recommendations are using, alongside what the forecast is reporting for your planned stay.
- **Traditional scope reference** — 5:1 and 7:1 chain lengths for the current depth, as a rule-of-thumb sanity check.
- **The two formulas** as toggles — **Catenary** (the physics calc) and **Wind + LOA** (the Yachting-Monthly rule). Either can be on, off, or both — when both are on, the recommendation takes the higher of the two values for safety. With neither, the dialog falls back to a simple `5×/6×/7×` scope. Toggles are saved to your vessel settings, so the same choice applies next time you anchor.

A short *How calculated* explanation at the top of the details dialog reflects whichever combination is active.

## Editing while anchored

You can adjust the anchor position by dragging it on the chart. The dialog stays open and recalculates the swing radius live.

## Sound

The anchor alarm shares the alert sound system. Acknowledge it from the on-screen banner; the alarm continues until the boat is back inside the swing circle.
