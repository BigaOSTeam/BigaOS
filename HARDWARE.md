# Boat OS - Hardware Documentation

## System Overview

This document contains complete hardware specifications, bill of materials, wiring diagrams, and installation instructions for the Boat OS intelligent automation system.

## Hardware Architecture

```
                    ┌─────────────────────┐
                    │  Raspberry Pi 5     │
                    │  (Below Deck)       │
                    │  - SignalK Server   │
                    │  - Automation Engine│
                    │  - Web Server       │
                    └──────┬──────┬───────┘
                           │      │
                ┏━━━━━━━━━━┛      └━━━━━━━━━━┓
                ┃                             ┃
         [CAN Bus Network]            [Ethernet Network]
                ┃                             ┃
      ┌─────────┴──────────┐         ┌───────┴────────┐
      │                    │         │                │
   ESP32 Nodes         ESP32 Nodes   Pi Zero 2W    Pi Zero 2W
   (Sensors)           (Controls)    (Helm Display) (Helm Display)
      │                    │
   - GPS/IMU           - Motor
   - Depth/Speed       - Winch              [WiFi Network]
   - Temperature       - Battery                  │
   - Anchor Sensor     Monitor              IP Cameras (3-4×)
```

## Bill of Materials (BOM)

### Computing Hardware

| Component | Quantity | Est. Cost | Purpose | Notes |
|-----------|----------|-----------|---------|-------|
| Raspberry Pi 5 (8GB) | 1 | $80 | Central server | Below deck in enclosure |
| Raspberry Pi Zero 2W | 2 | $30 | Helm displays | Alternative: use tablets |
| 7" Touchscreen Display | 2 | $45 each | Helm interface | Capacitive touch, 800×480 min |
| ESP32-DevKitC | 6-8 | $5 each | CAN nodes | One per sensor/control group |
| MicroSD Card (128GB) | 3 | $15 each | Storage | For Pi 5 and Pi Zeros |
| **Subtotal** | | **~$300** | | |

### CAN Bus Network

| Component | Quantity | Est. Cost | Purpose | Notes |
|-----------|----------|-----------|---------|-------|
| SN65HVD230 CAN Transceiver | 8 | $2 each | CAN interface for ESP32s | 3.3V compatible |
| Waveshare 2-CH CAN HAT | 1 | $30 | CAN interface for Pi 5 | Alternative: USB-CAN adapter |
| 4-conductor Marine Cable | 30m | $40 | CAN backbone | Twisted pair preferred |
| M12 4-pin Connectors | 20 | $2.50 each | Waterproof CAN connections | Alternative: Deutsch connectors |
| 120Ω Resistors | 2 | $1 | Bus termination | 1/4W, at each end of backbone |
| **Subtotal** | | **~$140** | | |

### Navigation Sensors

| Component | Quantity | Est. Cost | Purpose | Notes |
|-----------|----------|-----------|---------|-------|
| U-blox NEO-M8N GPS Module | 1 | $25 | Position, speed, time | NEO-M9N for better accuracy |
| Active GPS Antenna | 1 | $15 | GPS reception | SMA connector, 5m cable |
| Bosch BNO055 IMU | 1 | $35 | Compass, gyro, accelerometer | 9-axis with sensor fusion |
| Antenna Mount (Mast) | 1 | $10 | GPS antenna mounting | Masthead or high point |
| **Subtotal** | | **~$85** | | |

### Environmental Sensors

| Component | Quantity | Est. Cost | Purpose | Notes |
|-----------|----------|-----------|---------|-------|
| DS18B20 Temperature Sensor | 5 | $3 each | Temperature monitoring | Waterproof probes |
| 4.7kΩ Resistors | 5 | $1 | Pull-up for DS18B20 | One per 1-wire bus |
| BME280 (Optional) | 2 | $5 each | Temp + Humidity | Alternative to DS18B20 |
| **Subtotal** | | **~$20** | | |

### Electrical Monitoring

| Component | Quantity | Est. Cost | Purpose | Notes |
|-----------|----------|-----------|---------|-------|
| INA226 Current Sensor | 2-3 | $5 each | Voltage + current monitoring | I2C interface |
| 50A/75mV Shunt Resistor | 2-3 | $8 each | Current measurement | Match to your max current |
| **Subtotal** | | **~$40** | | |

### Anchor System

| Component | Quantity | Est. Cost | Purpose | Notes |
|-----------|----------|-----------|---------|-------|
| Hall Effect Sensor (A3144) | 1 | $3 | Chain counting | Detect windlass rotation |
| Neodymium Magnets | 2-4 | $5 | Trigger hall sensor | Mount on windlass gypsy |
| 2-Channel Relay Module | 1 | $8 | Winch up/down control | 30A rated, SPDT |
| Emergency Stop Button | 1 | $8 | Safety cutoff | Waterproof, twist-lock |
| **Subtotal** | | **~$25** | | |

### Motor Control

| Component | Quantity | Est. Cost | Purpose | Notes |
|-----------|----------|-----------|---------|-------|
| MOSFET Module (PWM) | 1 | $8 | Throttle control | Or interface to existing controller |
| Temperature Sensor (Engine) | 1 | $3 | Engine room monitoring | DS18B20 |
| **Subtotal** | | **~$10** | | |

### Cameras

| Component | Quantity | Est. Cost | Purpose | Notes |
|-----------|----------|-----------|---------|-------|
| WiFi IP Camera (1080p) | 3-4 | $30 each | Video monitoring | RTSP support, night vision |
| Camera Mounts | 3-4 | $5 each | Installation | Waterproof/marine rated |
| **Subtotal** | | **~$120** | | |

### Networking

| Component | Quantity | Est. Cost | Purpose | Notes |
|-----------|----------|-----------|---------|-------|
| Ethernet Switch (8-port) | 1 | $25 | Display network | Managed switch preferred |
| Cat5e/Cat6 Ethernet Cable | 20m | $15 | Display connections | Outdoor-rated if exposed |
| RJ45 Connectors | 10 | $5 | Ethernet termination | Or pre-made cables |
| WiFi Router/Access Point | 1 | $30 | Camera network | Or use Pi 5 as AP |
| **Subtotal** | | **~$75** | | |

### Power Distribution

| Component | Quantity | Est. Cost | Purpose | Notes |
|-----------|----------|-----------|---------|-------|
| 12V→5V 5A Buck Converter | 1 | $15 | Pi 5 power | Marine-grade, waterproof |
| 12V→5V 3A Buck Converter | 4 | $8 each | Pi Zeros + ESP32s | One per device group |
| Fuse Block / Distribution | 1 | $20 | Circuit protection | With appropriate fuses |
| Fuses (Various) | 10 | $10 | Overcurrent protection | 1A, 2A, 5A, 10A |
| Wire (Various Gauges) | Bulk | $30 | Power distribution | Marine tinned copper |
| **Subtotal** | | **~$110** | | |

### Enclosures & Mounting

| Component | Quantity | Est. Cost | Purpose | Notes |
|-----------|----------|-----------|---------|-------|
| IP65 Enclosure (Large) | 1 | $25 | Pi 5 housing | Below deck, waterproof |
| IP65 Enclosure (Small) | 6 | $8 each | ESP32 nodes | DIN rail mount |
| Waterproof Cable Glands | 20 | $1 each | Cable entry | PG7/PG9 size |
| DIN Rail | 2m | $10 | Mounting ESP32 enclosures | Optional, for organization |
| Display Bezels/Mounts | 2 | $15 each | Helm display mounting | Flush or surface mount |
| **Subtotal** | | **~$120** | | |

### Tools & Consumables

| Item | Est. Cost | Notes |
|------|-----------|-------|
| Crimping Tools | $30 | For CAN connectors |
| Multimeter | $25 | Testing voltages |
| Heat Shrink Tubing | $10 | Wire protection |
| Cable Ties | $5 | Wire management |
| Electrical Tape | $5 | Insulation |
| Solder & Soldering Iron | $20 | Connections |
| **Subtotal** | **~$95** | One-time investment |

## Total Cost Breakdown

| Category | Cost |
|----------|------|
| Computing Hardware | $300 |
| CAN Bus Network | $140 |
| Navigation Sensors | $85 |
| Environmental Sensors | $20 |
| Electrical Monitoring | $40 |
| Anchor System | $25 |
| Motor Control | $10 |
| Cameras | $120 |
| Networking | $75 |
| Power Distribution | $110 |
| Enclosures & Mounting | $120 |
| Tools & Consumables | $95 |
| **TOTAL** | **~$1,140** |

*Note: This is a comprehensive build. You can reduce costs by:*
- Using tablets instead of Pi Zero 2W + displays (-$120)
- Fewer cameras initially (-$30-60)
- Starting with fewer ESP32 nodes (-$20-40)
- USB-CAN adapter instead of CAN HAT (-$15)

**Realistic Starting Cost: ~$750-900**

## CAN Bus Wiring

### CAN Bus Topology

```
Termination Resistor (120Ω)
        │
    [Bow End]
        │
        ├─── ESP32 Node 1 (Anchor/Windlass)
        │         [Short stub <1m]
        │
        ├─── ESP32 Node 2 (Hull Sensors: Depth/Speed)
        │         [Short stub <1m]
        │
   [Main Backbone]
   4-wire cable:
   - CAN-H (Yellow/White)
   - CAN-L (Blue/White)
   - +12V (Red)
   - GND (Black)
        │
        ├─── ESP32 Node 3 (Navigation: GPS/IMU)
        │         [Short stub <1m]
        │
        ├─── ESP32 Node 4 (Cabin Sensors: Temperature)
        │         [Short stub <1m]
        │
        ├─── Raspberry Pi 5 (Main Server)
        │         [Direct connection to backbone]
        │
        ├─── ESP32 Node 5 (Engine: Motor Control, Temp, Battery)
        │         [Short stub <1m]
        │
        ├─── ESP32 Node 6 (Helm Controls: Buttons/Switches)
        │         [Short stub <1m]
        │
    [Stern End]
        │
Termination Resistor (120Ω)
```

### CAN Bus Specifications

- **Cable Type:** 4-conductor, twisted pair preferred (CAN-H/CAN-L twisted together)
- **Total Backbone Length:** 20-30 meters (should fit most 24ft boats)
- **Stub Length:** Keep stubs < 1 meter for reliability
- **Termination:** 120Ω resistors at both ends of backbone
- **Bit Rate:** 250 kbps (standard marine rate, NMEA2000 compatible)
- **Topology:** Linear bus (daisy-chain), NOT star topology
- **Connectors:** M12 4-pin or Deutsch DT series (waterproof)

### CAN Connection per ESP32 Node

Each ESP32 needs:
1. **SN65HVD230 CAN Transceiver Module**
   - VCC → 3.3V (from ESP32)
   - GND → GND (from ESP32)
   - CTX → GPIO5 (or chosen TX pin)
   - CRX → GPIO4 (or chosen RX pin)
   - CANH → CAN-H (from backbone)
   - CANL → CAN-L (from backbone)

2. **Power from backbone:**
   - +12V → Buck converter → 5V → ESP32 VIN
   - GND → ESP32 GND

### Raspberry Pi 5 CAN Connection

**Option A: Waveshare 2-CH CAN HAT**
- Mounts directly on GPIO header
- Provides 2 CAN channels (use one)
- Software: Enable SPI in raspi-config, load MCP2515 driver

**Option B: USB-CAN Adapter (PEAK PCAN-USB)**
- Plug into USB 3.0 port
- Simpler driver installation
- More expensive (~$30 vs ~$180 for PEAK, but cheap alternatives exist)

## Sensor Placement

### GPS Antenna
- **Location:** Masthead or highest practical point
- **Mounting:** Through-bolt or adhesive mount
- **Cable:** RG174 or RG316 coax, SMA connector
- **Cable Length:** Measure from mast to electronics bay (typically 5-10m)
- **Routing:** Protect cable through conduit, avoid sharp bends

### IMU (Compass/Gyro/Accelerometer)
- **Location:** Below deck, low in boat, near center of gravity
- **Critical:** Mount away from:
  - Iron/steel (engines, keel, batteries) - min 0.5m away
  - Magnets (speakers, pumps with magnetic couplings)
  - High-current wires
- **Orientation:** Mark forward direction clearly for calibration
- **Mounting:** Secure to rigid surface, minimize vibration

### Depth & Speed Transducers
- **Existing sensors:** Connect to ESP32 via existing wiring
- **ESP32 Node Location:** Near transducers or in bilge
- **Processing:** ESP32 handles signal conditioning before sending to CAN

### Temperature Sensors (DS18B20)
**Locations:**
1. **Engine Room:** Monitor for overheating, trigger fan
2. **Cabin:** Comfort monitoring
3. **Battery Compartment:** Battery temp monitoring
4. **Electronics Bay:** Ensure Pi 5 doesn't overheat
5. **Outside:** Ambient air temperature

**Wiring:** Can daisy-chain multiple DS18B20 on one 1-wire bus (3 wires: VCC, GND, DATA)

### Battery Monitors (INA226)
- **Location:** At each battery bank
- **Shunt Resistor:** Install in negative wire from battery
- **Voltage Sense:** Directly to battery terminals
- **Connection:** I2C bus to ESP32 (can chain multiple INA226 with different addresses)

### Anchor Chain Counter
- **Sensor:** Hall effect sensor (A3144 or similar)
- **Magnet:** Mount on windlass gypsy (one or more magnets)
- **Positioning:** Sensor detects magnet passing = count chain links/rotations
- **Wiring:** Digital input to ESP32, pull-up resistor
- **Calibration:** Count pulses per meter of chain

### Cameras
1. **Anchor Camera:** View forward from bow
2. **Cockpit Camera:** View helm/deck area
3. **Stern Camera:** View stern/docking area
4. **Engine Room Camera (Optional):** Monitor engine space

**Mounting:** Waterproof enclosures, secure mounting with marine sealant

## Power Distribution

### 12V Boat Electrical Integration

```
[Boat 12V System]
       │
  [Fuse Block]
       │
       ├─ 5A Fuse → Buck Converter (5V 5A) → Raspberry Pi 5
       │
       ├─ 2A Fuse → Buck Converter (5V 3A) → Pi Zero 2W #1
       │
       ├─ 2A Fuse → Buck Converter (5V 3A) → Pi Zero 2W #2
       │
       ├─ 5A Fuse → CAN Bus Backbone +12V
       │              │
       │              ├─ Buck Converter → ESP32 Node 1
       │              ├─ Buck Converter → ESP32 Node 2
       │              ├─ Buck Converter → ESP32 Node 3
       │              ├─ Buck Converter → ESP32 Node 4
       │              ├─ Buck Converter → ESP32 Node 5
       │              └─ Buck Converter → ESP32 Node 6
       │
       ├─ 2A Fuse → Ethernet Switch
       │
       ├─ 10A Fuse → Windlass Relay (existing windlass power)
       │
       └─ 2A Fuse → WiFi Router/AP
```

### Power Consumption Estimates

| Device | Voltage | Current | Power |
|--------|---------|---------|-------|
| Raspberry Pi 5 | 5V | 3-4A | 15-20W |
| Pi Zero 2W (each) | 5V | 0.5-1A | 2.5-5W |
| ESP32 (each) | 5V | 0.2-0.5A | 1-2.5W |
| Touchscreen (each) | 5V | 0.5A | 2.5W |
| Ethernet Switch | 12V | 0.3A | 3.6W |
| WiFi Router | 12V | 0.5A | 6W |
| **Total** | | | **~50-70W** |

**From 12V Battery:** ~4-6A (plus windlass and motor when active)

### Power Protection

- **Fuses:** Use appropriate fuses for each circuit
- **Reverse Polarity Protection:** Diodes or MOSFET protection on critical components
- **Buck Converters:** Use quality marine-grade converters with input filtering
- **Decoupling:** Add capacitors near ESP32s for voltage stability

## Ethernet Network

### Network Topology

```
[Raspberry Pi 5] (192.168.2.1)
       │
       │ Ethernet
       │
  [8-port Switch]
       │
       ├─── Pi Zero 2W #1 (Helm Display) - 192.168.2.11
       │
       ├─── Pi Zero 2W #2 (Helm Display) - 192.168.2.12
       │
       └─── (Future expansion ports)
```

### Network Configuration

- **Subnet:** 192.168.2.0/24
- **Pi 5:** Static IP 192.168.2.1 (gateway, DHCP server optional)
- **Pi Zeros:** Static IPs 192.168.2.11, 192.168.2.12
- **WiFi Network:** 192.168.3.0/24 (separate subnet for cameras/devices)

### Cable Routing

- Use Cat5e or Cat6 cable (outdoor-rated if exposed)
- Protect cables in conduit where possible
- Label both ends of each cable
- Test continuity before connecting devices

## WiFi Network (Cameras)

### WiFi Setup

**Option A: Pi 5 as WiFi Access Point**
- Add USB WiFi adapter to Pi 5
- Configure as AP (hostapd + dnsmasq)
- Subnet: 192.168.3.0/24

**Option B: Separate WiFi Router**
- Small marine WiFi router
- Connect via Ethernet to switch
- More reliable, better range

### Camera Configuration

- Assign static IPs to cameras (192.168.3.21, .22, .23, etc.)
- Configure RTSP streams (1080p, H.264)
- Enable authentication (username/password)
- Set low bitrate for bandwidth (1-2 Mbps per camera)

## Physical Installation Guide

### 1. Planning Phase

**Before you start:**
- [ ] Map out cable routes (CAN backbone, Ethernet, power)
- [ ] Identify mounting locations for all components
- [ ] Measure cable lengths needed
- [ ] Plan access to electronics bay
- [ ] Consider serviceability (can you reach components later?)

### 2. Mounting Locations

**Below Deck (Electronics Bay):**
- Raspberry Pi 5 in waterproof enclosure
- CAN bus junction/distribution point
- Ethernet switch
- Buck converters for power
- Battery monitor shunts (at batteries)

**At Helm:**
- 2× Touchscreen displays
- Clean, viewable mounting position
- Protect from direct sun if possible

**Throughout Boat:**
- ESP32 nodes in small enclosures near sensors/controls
- Temperature sensors in various compartments
- Cameras at strategic positions

**Mast:**
- GPS antenna at highest practical point

### 3. Installation Steps

#### Step 1: Install CAN Bus Backbone (Day 1-2)
1. Run 4-conductor cable from bow to stern
2. Install M12 connectors or Deutsch connectors at node locations
3. Install 120Ω termination resistors at both ends
4. Label all connection points
5. Test continuity of all wires

#### Step 2: Mount ESP32 Nodes (Day 2-3)
1. Install small waterproof enclosures at each node location
2. Mount ESP32 + CAN transceiver inside each enclosure
3. Connect to CAN backbone via connectors
4. Run power from backbone to buck converters to ESP32s
5. Add cable glands for sensor connections
6. Do NOT connect sensors yet - test CAN communication first

#### Step 3: Install Raspberry Pi 5 (Day 3)
1. Mount large waterproof enclosure in electronics bay
2. Install Pi 5 inside with proper cooling
3. Connect CAN HAT or USB-CAN adapter
4. Connect to CAN backbone
5. Install Ethernet switch near Pi 5
6. Connect Pi 5 to switch
7. Run power from boat 12V system via fused circuit

#### Step 4: Install Helm Displays (Day 3-4)
1. Mount display bezels at helm
2. Install Pi Zero 2W + touchscreen in bezels
3. Run Ethernet cables from helm to switch (below deck)
4. Run power to displays (separate 12V→5V converters)
5. Label all cables

#### Step 5: Install Sensors (Day 4-6)
1. **GPS:** Install antenna on mast, run coax to nav node
2. **IMU:** Mount BNO055 below deck (away from magnets), connect to nav node
3. **Depth/Speed:** Connect existing transducers to hull sensors node
4. **Temperature:** Install DS18B20 probes, route wires to environmental node
5. **Battery Monitor:** Install INA226 + shunts, connect to engine node
6. **Anchor Sensor:** Install hall sensor and magnet on windlass, connect to anchor node

#### Step 6: Install Control Systems (Day 6-7)
1. **Windlass:** Install relay module, connect to windlass power and control
2. **Motor:** Interface throttle control from engine node to motor controller
3. **Safety:** Install emergency stop button with proper wiring

#### Step 7: Install Cameras (Day 7)
1. Mount cameras at bow, stern, cockpit, engine room
2. Configure WiFi settings on each camera
3. Set up WiFi network (AP on Pi 5 or separate router)
4. Test RTSP streams from each camera

#### Step 8: Testing & Calibration (Day 8-10)
1. Power up system sequentially (Pi 5 first, then nodes)
2. Test CAN bus communication (all nodes visible)
3. Test Ethernet connectivity (displays connect)
4. Calibrate IMU compass
5. Calibrate depth and speed sensors
6. Calibrate anchor chain counter
7. Test all controls with safety precautions
8. Test state detection (anchoring, sailing, motoring)
9. Test automations
10. Sea trial!

## Safety Considerations

### Electrical Safety
- [ ] All 12V circuits properly fused
- [ ] No exposed high-current connections
- [ ] Waterproof enclosures properly sealed
- [ ] Strain relief on all cable entries
- [ ] Proper wire gauges for current loads
- [ ] Good crimps and solder joints

### Marine Environment
- [ ] All electronics in waterproof enclosures (IP65 minimum)
- [ ] Use tinned copper wire (resists corrosion)
- [ ] Apply dielectric grease to connectors
- [ ] Protect cables from chafe and UV
- [ ] Secure all components against vibration and impact
- [ ] Route cables away from bilge water

### Control System Safety
- [ ] Emergency stop button for windlass
- [ ] Software interlocks (can't raise and lower anchor simultaneously)
- [ ] Timeout limits on motor control
- [ ] Anchor alarm properly calibrated
- [ ] Test all automations before relying on them
- [ ] Manual override available for all automated systems

### Backup Systems
- [ ] Keep manual compass onboard
- [ ] GPS failure procedures
- [ ] Manual windlass operation (crank/handle)
- [ ] Backup battery monitoring (voltmeter)

## Maintenance & Troubleshooting

### Regular Maintenance

**Monthly:**
- Check all connections for corrosion
- Test camera functionality
- Verify CAN bus communication (check logs)
- Test anchor alarm

**Seasonal:**
- Clean camera lenses
- Check IMU calibration
- Verify depth sensor accuracy
- Update software
- Backup configuration and logs

### Troubleshooting Guide

**No CAN Communication:**
- Check termination resistors (should measure ~60Ω between CAN-H and CAN-L)
- Verify power to all nodes
- Check for short circuits or broken wires
- Use oscilloscope to verify CAN signals

**Compass Inaccurate:**
- Re-calibrate IMU
- Check for new magnetic interference sources
- Verify mounting hasn't shifted
- Check for steel/iron objects nearby

**Display Not Connecting:**
- Check Ethernet cable continuity
- Verify Pi Zero 2W has power and boots (LED indicators)
- Check network configuration (IP address)
- Verify switch has power and link lights

**GPS No Fix:**
- Check antenna cable connection
- Verify antenna has clear view of sky
- Wait longer for initial fix (can take 5-10 minutes cold start)
- Check antenna power (active antennas need power)

**Camera Streams Dropping:**
- Check WiFi signal strength
- Reduce camera bitrate/resolution
- Check Pi 5 CPU load (transcoding is intensive)
- Add WiFi repeater if needed

## Upgrade Path

### Phase 1 (Essential)
- Raspberry Pi 5, CAN bus, basic sensors
- GPS, IMU, depth, speed
- 1-2 displays
- Basic state detection

### Phase 2 (Enhanced)
- Temperature sensors
- Battery monitoring
- Anchor automation
- Weather integration

### Phase 3 (Full Featured)
- Motor control
- Windlass automation
- Cameras
- Full automation suite

### Future Expansion Ideas
- AIS receiver (ship traffic)
- Radar integration
- Autopilot integration (via NMEA0183/2000)
- Solar panel monitoring
- Bilge pump automation
- Lighting control (anchor light, nav lights)
- Audio system integration
- VHF radio integration (DSC)

## Resources & Suppliers

### Online Suppliers
- **Electronics:** Adafruit, SparkFun, AliExpress, Amazon
- **Marine Hardware:** West Marine, Fisheries Supply, Defender
- **Raspberry Pi:** Adafruit, CanaKit, official distributors
- **CAN Components:** eBay, AliExpress (cheap transceivers)
- **Connectors:** Digi-Key, Mouser (M12/Deutsch)

### Useful Links
- NMEA 2000 PGN Database: https://www.nmea.org/
- SignalK Documentation: https://signalk.org/
- Marine How-To: https://www.marinehowto.com/
- CAN Bus Tutorial: https://www.csselectronics.com/pages/can-bus-simple-intro-tutorial

## Appendix: Connector Pinouts

### M12 4-Pin (CAN Bus)
```
Pin 1: CAN-H (White or Yellow)
Pin 2: CAN-L (Blue or Green)
Pin 3: +12V (Red)
Pin 4: GND (Black)
```

### RJ45 Ethernet (T568B)
```
Pin 1: Orange/White
Pin 2: Orange
Pin 3: Green/White
Pin 4: Blue
Pin 5: Blue/White
Pin 6: Green
Pin 7: Brown/White
Pin 8: Brown
```

### SN65HVD230 CAN Transceiver
```
3V3  - 3.3V power
GND  - Ground
CTX  - CAN TX (to ESP32 GPIO)
CRX  - CAN RX (to ESP32 GPIO)
CANH - CAN High (to bus)
CANL - CAN Low (to bus)
```

---

**Document Version:** 1.0
**Last Updated:** 2025-11-17
**Target Boat:** 24ft Sailboat with Electric Motor
