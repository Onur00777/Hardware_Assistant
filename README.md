# HardwarePowerStudio

HardwarePowerStudio (`hardware-power-studio` 1.0.0) is a local engineering workbench for Formula Student GLV boards. It sizes the power tree, regulator junction temperature, LTE bulk capacitance, ISO 7637 input protection, high-side harness fuses, PCB copper and impedance, the analog front end, and the CAN physical layer, then exports an LTspice deck, an Altium Designer rule script, a BOM, and a design-review dossier.

The calculations run in the browser. Nothing in the workbench calls a hosted solver. `npm run check:math` re-executes the same functions against fixed numeric cases.

These numbers are a first sizing pass. Confirm θJA, TVS clamp, fuse I²t, and MLCC bias on the datasheets before the design is released.

## Reproduce

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The workbench starts on the IST27 VCU preset.

```bash
npm run check:math   # numeric self-check, no browser
npm run build        # production compile
npm run start        # serve the production build
npm run lint
```

`check:math` exits non-zero when any assertion fails. The script is `src/lib/engineering/self-check.ts`.

## System architecture

Next.js 14 (App Router) renders one client workbench. `WorkbenchProvider` holds the project, runs every analyzer, and chooses the open studio. Studios are pure views over that state.

```
src/app/page.tsx                 workbench shell
src/context/WorkbenchContext.tsx project state and analyzer memoization
src/lib/preset.ts                base profile and the three board presets
src/lib/engineering/*            numeric modules
src/lib/power-topology.ts        power-tree graph and fault flags
src/lib/altium-script.ts         DelphiScript, JavaScript, and the rule table
src/lib/exporters.ts             LTspice, CSV, BOM, design review
src/app/api/altium/*             local rule and BOM bridge
```

The header reports five live checks for the open preset: 24 V TVS margin, worst junction temperature, LTE droop margin, CAN bit-timing error, and the Middlebrook peak ratio.

### The studios

| Studio | Module | What it decides |
| --- | --- | --- |
| Design gate | `design-gate.ts` | Release checklist. Each row is a pass, watch, or fail taken from the studios below |
| Power tree | `engineering/power.ts` | Rail tree, idle / active / mission / peak current, fuse, IPC-2152 source trace |
| Regulator | `engineering/regulator.ts`, `magnetics.ts` | LDO or buck loss, junction temperature, inductor, MLCC bias |
| Bulk cap | `engineering/capacitance.ts` | Hold-up through an LTE/GSM current pulse |
| Protection | `engineering/protection.ts` | Reverse polarity, TVS energy, damped input filter |
| Harness | `engineering/harness.ts` | High-side switch temperature, wire drop, fuse I²t versus wire I²t |
| PCB | `engineering/pcb.ts`, `ipc2152.ts` | Trace width, via current, JLCPCB stackup impedance |
| Analog | `engineering/analog.ts` | E96/E24 divider, STM32 charge injection, NTC |
| CAN bus | `engineering/can.ts` | Bit timing, sample point, bus and stub length |
| Export | `exporters.ts`, `altium-script.ts` | LTspice, Altium rules, BOM, dossier |

Magnetics is not its own tab. The inductor and the output ceramics sit inside the Regulator studio.

The design gate does not add a new formula. It reads the fuse 75% rule, rail headroom, power balance, the 115 °C junction line, buck inductor validity, bulk brownout, TVS coverage, the Middlebrook 0.1 ratio, harness drop / thermal / I²t, PCB pair convergence, the 0.5 LSB ADC droop, and CAN timing under 50 ppm. Fail means do not release. Watch means the hard limit still holds. The header link and the Copy verdict button produce the same list a design judge can paste into a review.

### Power-tree canvas

The Power tree studio draws the board as a node graph: 24 V feed, series reverse-polarity / TVS guard, buck regulators, LDOs, then loads. React Flow (`@xyflow/react`) lays the nodes out in those columns. Each node shows voltage, RMS current for the selected case (idle, active, mission, or peak), efficiency, and a thermal line.

A node is green while its own check passes. It pulses red when one of these is true:

- The regulator that matches that rail is at or above the 115 °C shutdown line, or its inputs are not a valid regulating point.
- The bulk-capacitance rail (the rail nearest the bulk-cap nominal voltage) sags below brownout, or no catalog network can hold that brownout.
- A high-side channel on the feed reaches its thermal-shutdown threshold in steady state or inrush.
- The TVS standoff is below the system maximum, or the clamp voltage is not inside the downstream buck absolute maximum.

Clicking a node opens the studio that owns that part: Protection for the feed and the guard, Regulator for a buck or LDO, Bulk cap for the LTE rail, and Analog, Harness, CAN, or Bulk cap for a load whose name matches that domain. Rail voltage, efficiency, parent, and load current are edited from the forms under the canvas.

## Physical formulas

Symbols below match the source. Currents are amperes, widths and copper thickness are mils unless a formula says millimetres, and temperatures are degrees Celsius.

### Power tree

Uncorrelated rectangular loads. For one row, `I` is the on-current and `D` is the duty fraction. Average is `I·D`. RMS of that row is `I·√D`. Coincident peak is the arithmetic sum and is reported separately. Mission includes active and burst rows at `I·D`. Peak forces active and burst rows fully on together.

An LDO draws `I_in = I_out + I_q` from its parent. A buck refers output current by

```
k = Vout / (Vin · η)
I_in,avg = k · I_out,avg + I_q
```

with η held constant and excluding quiescent current from the efficiency number. Source power must equal load power plus converter loss. `check:math` requires that balance error to be under 1 µW on every case.

The input fuse is the next mini/ATO rating at or above `I_rms / 0.75`, so mission RMS stays at or below 75% of the fuse rating.

### IPC-2152 trace heating

IPC-2152 publishes charts. The closed form is the Brooks & Adam regression of those charts (D. G. Brooks and J. Adam, “Trace Currents and Temperatures Revisited”, 2015), the same fit KiCad uses:

```
ΔT = K · I^a · W^b · Th^c
```

External copper, every weight:

```
K = 215.3,  a = 2,  b = −1.15,  c = −1
ΔT = 215.3 · I² · W^(−1.15) · Th^(−1)
```

Internal, 1 oz:

```
K = 200,  a = 1.9,  b = −1.10,  c = −1.52
ΔT = 200 · I^1.9 · W^(−1.10) · Th^(−1.52)
```

`I` is amperes, `W` and `Th` are mils, `ΔT` is the rise above ambient. One ounce is 35 µm, which is `35 / 25.4` mil. Solving for width:

```
W = (K · I^a / (ΔT · Th^(−c))) ^ (1 / −b)
```

The external fit is still air with no adjacent plane, so a width taken from it is conservative on a 4-layer board. The recommended width is rounded up to a 0.05 mm quantum and is never below the 0.20 mm fabrication floor. Internal 0.5 oz and 2 oz rows in the PCB studio use the same family with `K = 120` and `K = 300`.

A via barrel is given the copper cross-section `π·d·t` and then the internal fit. Thermal conduction of one via into the nearest plane is

```
R_via = h / (k_Cu · π · d · t)     k_Cu = 385 W/m·K
R_array = R_via / N
θJA = θJC + R_array + θ_plane-to-ambient
```

### Middlebrook filter stability

The input filter is an LC with an optional series Rd–Cd damper across the shunt capacitor. Characteristic impedance and cutoff:

```
Z0 = √(L / C)
f_c = 1 / (2π √(L C))
```

Below the buck voltage-loop crossover the constant-power input impedance is

```
|Zin| = η · Vin² / Pout
```

Above crossover it rises in proportion to frequency, `|Zin|(f) = |Zin|(f_cross) · f / f_cross`. Filter `|Zout|(f)` is the parallel combination of the inductor branch `(Rl + jωL)` and the capacitor branch, with the damper in parallel with C when both `Rd` and `Cd` are positive.

The sweep runs 80 logarithmic steps from 100 Hz to 10 MHz. The design is stable when the peak ratio stays under 0.1:

```
max |Zout| / |Zin| < 0.1
```

That ratio is 20 dB. The suggested damper, used when the peak fails, is `Rd = Z0` and `Cd = 4 C`.

TVS checks are separate. Standoff must be at least the maximum operating GLV. Clamp voltage must sit below the downstream buck absolute maximum. Coil energy dumped into the TVS is `½ L_coil I_coil²`, compared with `P_pp · 1 ms` as a rectangular 10/1000 µs rating.

### MLCC DC-bias derating

Effective capacitance of one ceramic is nameplate times DC-bias retention times temperature retention. Bias retention is a fitted curve, not a vendor table:

```
x = max(0, Vdc / Vrated)
retention_dc = 1 / (1 + a · x^b)
```

| Case | a (X7R) | b |
| --- | ---: | ---: |
| 0402 | 8 | 1.55 |
| 0603 | 5.8 | 1.45 |
| 0805 | 2.4 | 1.75 |
| 1206 | 1.35 | 1.85 |

X5R multiplies `a` by 1.35. Temperature retention inside the dielectric window (X7R to 125 °C, X5R to 85 °C, both from −55 °C) is

```
span = T_edge − 25
retention_T = 1 − 0.15 · (min(|T − 25|, span) / span)²
```

Past the window the result is scaled down further and flagged. Output ripple splits into capacitive and ESR parts:

```
ΔV_cap = ΔI / (8 · fsw · C_eff)
ΔV_esr = ΔI · ESR
```

The buck inductor, in continuous conduction with ideal switches:

```
D = Vout / Vin
ΔI = k · Iout          k is the ripple fraction, 0.20 to 0.40
L = (Vin − Vout) · D / (fsw · ΔI)
Ipeak = Iout + ΔI / 2
Isat ≥ Ipeak · (1 + margin)
Irms² = Iout² + ΔI² / 12
```

Copper resistance is `R(T) = R25 · (1 + 0.00393 · (T − 25))`. Core loss uses the improved Generalized Steinmetz equation on a 3C90-class MnZn ferrite. The sine-wave law, in W/m³ with B in tesla, is

```
Pv = k · f^α · Bpk^β
k = 4.74,  α = 1.46,  β = 2.75
```

which is about 150 mW/cm³ at 100 kHz and 100 mT. Triangular buck flux uses

```
Pv = k_i · (ΔB)^β · f^α · (D^(1−α) + (1−D)^(1−α))
ΔB = Bsat · ΔI / Isat,   Bsat = 0.35 T
```

with `k_i` defined so a sine wave reproduces the Steinmetz law.

### Steinhart–Hart NTC linearization

Beta model, temperature in kelvin:

```
R(T) = R0 · exp(β (1/T − 1/T0))
```

Steinhart–Hart:

```
1/T = A + B ln R + C (ln R)³
T_C = 1 / (A + B ln R + C (ln R)³) − 273.15
```

With `C = 0`, `B = 1/β`, and `A = 1/T0 − (ln R0)/β`, the two curves are the same. The divider is Vref, then the fixed resistor, then the ADC node, then the NTC to ground.

The high-voltage sense divider snaps to E24 or E96:

```
Vout = Vin · R2 / (R1 + R2)
Rth = R1 ∥ R2
```

STM32 sample-and-hold charge injection, sample capacitor starting empty:

```
ΔV = V · C_ADC / (C_filt + C_ADC)
LSB error = ΔV / (Vref / 2^N)
C_filt ≥ C_ADC · (2^N / 0.5 − 1)     for 0.5 LSB at full scale
```

Settling during the sampling window is `ε = exp(−t_sample / ((Rth + R_ADC) · C_ADC))`.

### IEC wire adiabatic limit

The short-circuit thermal limit of a copper conductor, before heat leaves the metal, is the IEC adiabatic form used for PVC and XLPE:

```
I²t = (k · S)²
```

`S` is the cross-section in mm². The insulation constants in this workbench are `k = 115` for PVC and `k = 143` for XLPE. A fuse coordinates when its melting I²t is below that wire I²t. Melting I²t for the mini/ATO series is tabulated in `engineering/harness.ts` from 1 A to 30 A; other ratings are interpolated. Wire drop uses the round-trip loop at copper resistivity corrected for temperature. Steady wire rise iterates dissipation into free air six times.

High-side junction rise during a pulse uses a two-time-constant thermal impedance: die, then board, each `R (1 − exp(−t/τ))`.

### Junction temperature and bulk hold-up

LDO package loss is `(Vin − Vout)·Iout + Vin·Iq`. Junction temperature is

```
Tj = Ta + P_loss · θJA
```

The meter calls shutdown at 115 °C. Below that the bands are under 70 °C, 70–100 °C, and 100–115 °C. Package θJA defaults are SOT-23 236, SOT-223 62, SOIC-8 116, DPAK 50, and QFN 35 °C/W, unless a datasheet override is set. Buck loss splits conduction, switching, dead time, gate drive, and inductor DCR. Inductor DCR is not inside the package θJA.

Bulk hold-up integrates the LTE pulse. Load current is `Ipeak` until the burst ends. Regulator current slews toward the load at `Ipeak / t_response`. Capacitor voltage is

```
v = Vnom − I_cap · ESR − Q / C
```

ESR is allowed to consume `esrFraction` of the droop budget, so `ESR_max = esrFraction · ΔV / Ipeak`. Brownout is `Vnom − ΔV`. `Cmin` is the smallest capacitance whose simulated minimum lands on that line. The catalog search then prefers a polymer plus at least two MLCCs whose effective capacitance and ESR meet both limits. Effective MLCC farads in that search use the retention fraction typed into the bulk-cap studio.

### CAN bit timing and pair impedance

One-way cable delay is 5 ns/m (`2×10⁸ m/s`). The length column follows the conservative ISO 11898-2 set: 500 m at 125 kbit/s, 250 m at 250 kbit/s, 100 m at 500 kbit/s, 25 m at 1 Mbit/s, with a 0.3 m stub guideline. The bit-timing search fits the MCU time quanta (STM32 FDCAN or bxCAN) to the requested sample point. Timing error is

```
ppm = |f_actual − f_bit| / f_bit · 10⁶
```

The header treats the bus as in limits when a solution exists and `|ppm| < 50`.

Differential impedance on the selected JLCPCB stackup is the edge-coupled approximation

```
Zdiff = 2 Z0(W) · (1 − 0.48 exp(−0.96 · S/H))
```

Width and gap are bisected to 90 Ω (USB) and 120 Ω (CAN). Microstrip uses Hammerstad. The 50 Ω coplanar waveguide uses the conformal-mapping form.

## Altium Designer bridge

`src/lib/altium-script.ts` writes two scripts that run inside Altium Designer, with a PCB document focused:

- `HardwarePowerStudio_Rules.pas` — DelphiScript, entry point `HWPS_ImportRules`
- `HardwarePowerStudio_Rules.js` — the same import for Altium’s JavaScript script engine

Run them from DXP » Run Script. The entry point creates net classes `PWR_24V`, `PWR_5V`, `PWR_3V8_LTE`, and `PWR_3V3`, differential-pair classes `CAN_120R` and `USB_90R`, then adds or updates PCB rules:

- Width rules from the IPC-2152 external fit at the mission RMS of each power rail (minimum 0.20 mm, preferred equal to the exact width, maximum at least twice preferred).
- Differential-pair routing rules at the solved USB 90 Ω and CAN 120 Ω width and gap, with 0.05 mm of extra maximum width and gap.
- `HWPS_ComponentKeepout`, a 0.25 mm component-to-component clearance.
- `HWPS_PWR_24V_Clearance`, a 0.50 mm copper clearance from `InNetClass('PWR_24V')` to every other net.

Name the PCB nets and pair classes to match those identifiers. Re-running the script updates rules that already use the `HWPS_` names.

The Export studio can download the scripts directly. It can also POST the open project to the local bridge:

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| GET | `/api/altium/export-rules` | none | Scripts and the rule table for the base Formula Student profile (`createProject`) |
| POST | `/api/altium/export-rules` | project JSON | Scripts and the rule table for that project |
| GET | `/api/altium/sync-bom` | none | BOM CSV and rows for the base profile |
| POST | `/api/altium/sync-bom` | project JSON | BOM CSV and rows for that project |

A project body needs `name`, `traceRiseC`, `rails`, `loads`, and the `pcb`, `protection`, `regulator`, `magnetics`, `capacitance`, `harness`, `analog`, and `can` objects. A malformed body returns 400. Start the app with `npm run dev` before calling the routes. Example from another tool on the same machine:

```bash
curl -s http://localhost:3000/api/altium/export-rules
curl -s -X POST http://localhost:3000/api/altium/sync-bom \
  -H "content-type: application/json" \
  --data-binary @project.json
```

The LTspice export is a `.cir` netlist with `.tran 5m`: battery, EMI filter, constant-power buck input, 3.8 V bulk capacitor, and the LTE pulse. The `.asc` file is a schematic companion. The design-review Markdown and HTML dossier restates thermal margin, fuse I²t, the Middlebrook ratio, and the LTE droop.

## Board presets

All three presets start from the same GLV tree: 24 V source, 5 V buck, 3.3 V LDO, 3.8 V LTE buck. The header selector loads one of the following. Reset restores the selected preset and clears the modified flag.

### IST27 VCU

`vcu`. STM32H745, dual isolated CAN, four high-side drivers, APPS and brake-pressure analog.

- Drops the LTE, GNSS, and SD loads. Renames the MCU row to STM32H745 run.
- Adds APPS1/APPS2 (12 mA) and the brake pressure transducer (10 mA) on the 5 V rail.
- Regulator is the 5 V to 3.3 V LDO in SOT-223, preloaded with the 3.3 V mission RMS.
- Harness channels keep the fan, pump, brake light, and RTDS/shutdown naming.
- Analog divider is set for a 32 V sense into a 3 V ADC target with a 10 kΩ E96 bottom resistor.
- CAN is FDCAN at 500 kbit/s.

### IST27 Telemetry and datalogger

`telemetry`. STM32H743, Quectel LTE Cat-1, GNSS, SDMMC, IMU.

- Removes the radiator-fan load. Renames the modem row to Quectel LTE Cat-1 connected.
- Regulator is retargeted to a 24 V to 3.8 V buck in QFN at 2.1 MHz and 0.8 A, which is the modem rail rather than the 3.3 V LDO.
- Harness keeps only the shutdown channel, at 0.3 A resistive.
- Bulk capacitance is a 2 A, 577 µs burst with 200 mV of allowed droop and 50% MLCC retention.

### Combined stress fault

`stress`. This preset is supposed to fail checks. It is the case used to see red nodes.

- LDO is a SOT-23 at 55 °C ambient, 0.45 A, and 5 mA quiescent, which pushes the junction through the 115 °C shutdown line.
- The input filter damper is opened (`Rd = 0`, `Cd = 0`) and the TVS/buck pair is SMBJ33A into an MP2315, so standoff, clamp, or Middlebrook margin fails.
- Bulk capacitance is asked to hold a 6 A, 2 ms pulse with only 40 mV of droop, a 250 µs loop, 15% MLCC retention, and 35% of the droop given to ESR. No catalog network meets that brownout, so the 3.8 V rail is marked in fault.
- The brake-light channel inrush multiple is raised to 12 for 80 ms.

## What the self-check covers

`npm run check:math` checks, among other identities:

- IPC-2152 external round trip at 1 A and 10 °C, and the internal 1 oz round trip.
- Power balance on idle, active, mission, and peak for the base profile.
- LDO pass loss `(5 − 3.3)·0.2 W`, efficiency, and `Tj = Ta + P·θJA` on SOT-223.
- A damped filter under the 0.1 Middlebrook ratio, and an undamped LC over it.
- MLCC bias retention, Steinmetz / iGSE at the sine-wave calibration point, and inductor volt-seconds.
- E96 snapping, the NTC beta point, and Steinhart–Hart with `C = 0` returning 25 °C at R0.
- Charge-sharing droop under 0.5 LSB for the default hold capacitor.
- LTspice deck structure, the Altium CSV header, and the presence of `HWPS_ImportRules` in both generated scripts.
- BOM part numbers LMR36520, LM74700-Q1, and VNQ7050AJ.

## Limits

The workbench does not route a board, talk to an Altium process by itself, or read a schematic. The scripts have to be run by Altium on a focused PCB. Net class membership uses the net name equal to the class name; rename nets in the PCB to match, or add members after import. Efficiency of a buck in the power tree is an input, not a loss model. The loss model lives in the Regulator studio and applies to the single regulator being sized, which the canvas attaches to the rail of the same architecture whose voltage is closest to `Vout`. MLCC bias coefficients are a family fit for a sizing pass. Fuse melting I²t must be checked against the fuse curve that will actually be fitted.
