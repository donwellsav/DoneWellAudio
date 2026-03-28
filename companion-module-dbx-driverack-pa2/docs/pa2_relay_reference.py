#!/usr/bin/env python3
"""
PA2 WebSocket Relay
Bridges browser WebSocket connections to a dbx DriveRack PA2 over TCP.

Usage:
    python pa2_relay.py                          # auto-discover PA2
    python pa2_relay.py --pa2-host 192.168.1.50  # direct connect
    python pa2_relay.py --ws-port 8765           # custom WebSocket port

Dependencies:
    pip install websockets
"""

import asyncio
import json
import argparse
import re
import shlex
import socket
import sys
import time
from typing import Optional

try:
    import websockets
    # websockets v13+ uses asyncio.server
    try:
        from websockets.asyncio.server import serve as ws_serve
    except ImportError:
        from websockets.server import serve as ws_serve
except ImportError:
    print("Install websockets: pip install websockets")
    sys.exit(1)


# ── PA2 Protocol Constants ──────────────────────────────────────────

PA2_PORT = 19272
HELLO = "HiQnet Console"
AUTH_USER = "administrator"
AUTH_PASS_DEFAULT = "administrator"

# GEQ band labels (exact strings the PA2 expects)
GEQ_BANDS = {
    1: "20 Hz", 2: "25 Hz", 3: "31.5 Hz", 4: "40 Hz", 5: "50 Hz",
    6: "63 Hz", 7: "80 Hz", 8: "100 Hz", 9: "125 Hz", 10: "160 Hz",
    11: "200 Hz", 12: "250 Hz", 13: "315 Hz", 14: "400 Hz", 15: "500 Hz",
    16: "630 Hz", 17: "800 Hz", 18: "1.0 kHz", 19: "1.25 kHz", 20: "1.6 kHz",
    21: "2.0 kHz", 22: "2.5 kHz", 23: "3.15 kHz", 24: "4.0 kHz", 25: "5.0 kHz",
    26: "6.3 kHz", 27: "8.0 kHz", 28: "10.0 kHz", 29: "12.5 kHz", 30: "16.0 kHz",
    31: "20.0 kHz",
}


# ── PA2 TCP Connection ──────────────────────────────────────────────

class PA2Connection:
    """Manages a single TCP connection to a PA2 device."""

    def __init__(self, host: str, port: int = PA2_PORT, password: str = AUTH_PASS_DEFAULT):
        self.host = host
        self.port = port
        self.password = password
        self.reader: Optional[asyncio.StreamReader] = None
        self.writer: Optional[asyncio.StreamWriter] = None
        self.connected = False
        self.authenticated = False
        self.lock = asyncio.Lock()
        self._listeners: list[asyncio.Queue] = []
        self.topology: dict = {}  # discovered module paths

    async def connect(self) -> bool:
        """Connect, authenticate, and discover topology."""
        try:
            self.reader, self.writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port),
                timeout=10
            )
            self.connected = True
            print(f"[PA2] TCP connected to {self.host}:{self.port}")

            # Wait for hello
            hello = await self._readline(timeout=5)
            if hello != HELLO:
                print(f"[PA2] Unexpected hello: {hello}")
                return False
            print(f"[PA2] Got handshake: {hello}")

            # Authenticate
            await self._send(f"connect {AUTH_USER} {self.password}")
            auth_resp = await self._readline(timeout=5)

            if auth_resp.startswith("connect logged in as"):
                self.authenticated = True
                print(f"[PA2] Authenticated")
            elif auth_resp.startswith("error"):
                print(f"[PA2] Auth failed: {auth_resp}")
                return False
            else:
                print(f"[PA2] Unexpected auth response: {auth_resp}")
                return False

            # Discover topology before starting background reader
            await self._discover_topology()

            # Start background reader
            asyncio.create_task(self._read_loop())
            return True

        except Exception as e:
            print(f"[PA2] Connection error: {e}")
            self.connected = False
            return False

    async def _discover_topology(self):
        """Run ls \\Preset to discover which modules exist on this device."""
        await self._send('ls "\\\\Preset"')
        modules = []
        while True:
            line = await self._readline(timeout=5)
            if line.strip() == "endls":
                break
            # Lines look like "  ModuleName :" or "ModuleName :"
            line = line.strip()
            if line.endswith(":"):
                name = line[:-1].strip()
                if name and name != "..":
                    modules.append(name)

        self.topology = {
            "modules": modules,
            "stereo_geq": "StereoGEQ" in modules,
            "left_geq": "LeftGEQ" in modules,
            "right_geq": "RightGEQ" in modules,
            "has_high": "High Outputs PEQ" in modules,
            "has_mid": "Mid Outputs PEQ" in modules,
            "has_low": "Low Outputs PEQ" in modules,
            "has_crossover": "Crossover" in modules,
            "has_afs": "Afs" in modules,
            "has_compressor": "Compressor" in modules,
            "has_subharmonic": "SubharmonicSynth" in modules,
            "has_input_meters": "InputMeters" in modules,
            "has_output_meters": "OutputMeters" in modules,
        }
        print(f"[PA2] Topology: GEQ={'stereo' if self.topology['stereo_geq'] else 'dual-mono'}, "
              f"Outputs={'High' if self.topology['has_high'] else ''}"
              f"{'+Mid' if self.topology['has_mid'] else ''}"
              f"{'+Low' if self.topology['has_low'] else ''}")
        print(f"[PA2] Modules: {modules}")

    async def disconnect(self):
        """Clean disconnect."""
        self.connected = False
        self.authenticated = False
        if self.writer:
            try:
                self.writer.close()
                await self.writer.wait_closed()
            except:
                pass
        print("[PA2] Disconnected")

    async def send_command(self, command: str) -> None:
        """Send a raw protocol command to the PA2."""
        if not self.connected:
            raise ConnectionError("Not connected to PA2")
        await self._send(command)

    def add_listener(self, queue: asyncio.Queue):
        """Register a queue to receive PA2 responses."""
        self._listeners.append(queue)

    def remove_listener(self, queue: asyncio.Queue):
        """Unregister a response queue."""
        if queue in self._listeners:
            self._listeners.remove(queue)

    async def _send(self, message: str):
        """Send a line to the PA2."""
        async with self.lock:
            if self.writer:
                self.writer.write(f"{message}\n".encode("utf-8"))
                await self.writer.drain()
                print(f"[PA2] >>> {message}")

    async def _readline(self, timeout: float = 10) -> str:
        """Read a single line from the PA2."""
        if not self.reader:
            raise ConnectionError("No reader")
        data = await asyncio.wait_for(self.reader.readline(), timeout=timeout)
        line = data.decode("utf-8").strip()
        print(f"[PA2] <<< {line}")
        return line

    async def _read_loop(self):
        """Background loop: read PA2 responses and fan out to listeners."""
        while self.connected and self.reader:
            try:
                data = await self.reader.readline()
                if not data:
                    print("[PA2] Connection closed by device")
                    self.connected = False
                    break
                line = data.decode("utf-8").strip()
                if line:
                    print(f"[PA2] <<< {line}")
                    for q in self._listeners:
                        try:
                            q.put_nowait(line)
                        except asyncio.QueueFull:
                            pass
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[PA2] Read error: {e}")
                self.connected = False
                break


# ── Response Parser ──────────────────────────────────────────────────

import re
import shlex

def parse_pa2_response(raw: str) -> Optional[dict]:
    """
    Parse a raw PA2 response line into structured JSON.
    Returns None if not parseable.

    PA2 responses look like:
        get "\\\\Preset\\StereoGEQ\\SV\\1.0 kHz" "-3.0 dB"
        get "\\\\Node\\AT\\Class_Name" "dbxDriveRackPA2"
    """
    try:
        parts = shlex.split(raw)
    except ValueError:
        return None

    if len(parts) < 3:
        return None

    cmd = parts[0]
    if cmd not in ("get", "subr"):
        return None

    path = parts[1]
    value = parts[2]

    result = {"path": path, "raw_value": value}

    # ── Device info ──
    if "\\Node\\AT\\Class_Name" in path:
        return {"module": "device", "param": "model", "value": value}
    if "\\Node\\AT\\Instance_Name" in path:
        return {"module": "device", "param": "name", "value": value}
    if "\\Node\\AT\\Software_Version" in path:
        return {"module": "device", "param": "version", "value": value}

    # ── Presets ──
    if "\\Storage\\Presets\\SV\\CurrentPreset" in path:
        return {"module": "preset", "param": "current", "value": value}
    if "\\Storage\\Presets\\SV\\Changed" in path:
        return {"module": "preset", "param": "changed", "value": value}

    # ── GEQ ──
    geq_match = re.search(r"\\(StereoGEQ|LeftGEQ|RightGEQ)\\SV\\(.+)$", path)
    if geq_match:
        channel_map = {"StereoGEQ": "Stereo", "LeftGEQ": "Left", "RightGEQ": "Right"}
        channel = channel_map.get(geq_match.group(1), "Stereo")
        param = geq_match.group(2)
        if param == "GraphicEQ":
            return {"module": "geq", "channel": channel, "param": "enabled", "value": value == "On"}
        elif param == "QuickCurve":
            return {"module": "geq", "channel": channel, "param": "mode", "value": value}
        else:
            # It's a band label like "1.0 kHz"
            # Find band number
            band_num = None
            for num, label in GEQ_BANDS.items():
                if label == param:
                    band_num = num
                    break
            if band_num:
                db_val = _parse_db(value)
                return {"module": "geq", "channel": channel, "param": "band",
                        "band": band_num, "value": db_val}

    # ── Output PEQ ──
    peq_match = re.search(r"\\(High|Mid|Low) Outputs PEQ\\SV\\(.+)$", path)
    if peq_match:
        output = peq_match.group(1)
        param = peq_match.group(2)
        if param == "ParametricEQ":
            return {"module": "peq", "output": output, "param": "enabled", "value": value == "On"}
        band_match = re.match(r"Band_(\d+)_(.+)", param)
        if band_match:
            filt_num = int(band_match.group(1))
            field = band_match.group(2)
            parsed_val = value
            if field == "Frequency":
                parsed_val = _parse_freq(value)
            elif field == "Gain":
                parsed_val = _parse_db(value)
            elif field in ("Q", "Slope"):
                parsed_val = _parse_float(value)
            return {"module": "peq", "output": output, "param": "filter",
                    "filter": filt_num, "field": field, "value": parsed_val}

    # ── AutoEQ / Room EQ ──
    aeq_match = re.search(r"\\RoomEQ\\SV\\(.+)$", path)
    if aeq_match:
        param = aeq_match.group(1)
        if param == "ParametricEQ":
            return {"module": "autoeq", "param": "enabled", "value": value == "On"}
        if param == "Flatten":
            return {"module": "autoeq", "param": "mode", "value": value}
        band_match = re.match(r"Band_(\d+)_(.+)", param)
        if band_match:
            filt_num = int(band_match.group(1))
            field = band_match.group(2)
            parsed_val = value
            if field == "Frequency":
                parsed_val = _parse_freq(value)
            elif field == "Gain":
                parsed_val = _parse_db(value)
            elif field in ("Q", "Slope"):
                parsed_val = _parse_float(value)
            return {"module": "autoeq", "param": "filter",
                    "filter": filt_num, "field": field, "value": parsed_val}

    # ── AFS ──
    afs_match = re.search(r"\\Afs\\SV\\(.+)$", path)
    if afs_match:
        param = afs_match.group(1)
        param_map = {
            "AFS": ("enabled", lambda v: v == "On"),
            "FilterMode": ("mode", lambda v: v),
            "ContentMode": ("content", lambda v: v),
            "MaxFixedFilters": ("fixed_filters", lambda v: int(v)),
            "LiftTime": ("lift_time", lambda v: _parse_time_sec(v)),
        }
        if param in param_map:
            name, transform = param_map[param]
            return {"module": "afs", "param": name, "value": transform(value)}

    # ── Compressor ──
    comp_match = re.search(r"\\Compressor\\SV\\(.+)$", path)
    if comp_match:
        param = comp_match.group(1)
        param_map = {
            "Compressor": ("enabled", lambda v: v == "On"),
            "Threshold": ("threshold", lambda v: _parse_db(v)),
            "Gain": ("gain", lambda v: _parse_db(v)),
            "Ratio": ("ratio", lambda v: v),  # keep "4.0:1" as string
            "OverEasy": ("overeasy", lambda v: int(v) if v != "Off" else 0),
        }
        if param in param_map:
            name, transform = param_map[param]
            return {"module": "compressor", "param": name, "value": transform(value)}

    # ── Limiters ──
    lim_match = re.search(r"\\(High|Mid|Low) Outputs Limiter\\SV\\(.+)$", path)
    if lim_match:
        output = lim_match.group(1)
        param = lim_match.group(2)
        param_map = {
            "Limiter": ("enabled", lambda v: v == "On"),
            "Threshold": ("threshold", lambda v: _parse_db(v)),
            "OverEasy": ("overeasy", lambda v: _parse_float(v) if v != "Off" else 0),
        }
        if param in param_map:
            name, transform = param_map[param]
            return {"module": "limiter", "output": output, "param": name, "value": transform(value)}

    # ── Output Mutes ──
    mute_match = re.search(r"\\OutputGains\\SV\\(.+)OutputMute$", path)
    if mute_match:
        output = mute_match.group(1)
        return {"module": "mute", "output": output, "value": value == "On"}

    # ── Subharmonic ──
    sub_match = re.search(r"\\SubharmonicSynth\\SV\\(.+)$", path)
    if sub_match:
        param = sub_match.group(1)
        if param == "SubharmonicSynth":
            return {"module": "subharmonic", "param": "enabled", "value": value == "On"}
        elif param == "Subharmonics":
            return {"module": "subharmonic", "param": "master", "value": _parse_percent(value)}
        elif "24-36" in param:
            return {"module": "subharmonic", "param": "lows", "value": _parse_percent(value)}
        elif "36-56" in param:
            return {"module": "subharmonic", "param": "highs", "value": _parse_percent(value)}

    # ── Input Delay ──
    idly_match = re.search(r"\\Back Line Delay\\SV\\(.+)$", path)
    if idly_match:
        param = idly_match.group(1)
        if param == "Delay":
            return {"module": "input_delay", "param": "enabled", "value": value == "On"}
        elif param == "Amount":
            return {"module": "input_delay", "param": "ms", "value": _parse_time_ms(value)}

    # ── Output Delays ──
    odly_match = re.search(r"\\(High|Mid|Low) Outputs Delay\\SV\\(.+)$", path)
    if odly_match:
        output = odly_match.group(1)
        param = odly_match.group(2)
        if param == "Delay":
            return {"module": "output_delay", "output": output, "param": "enabled", "value": value == "On"}
        elif param == "Amount":
            return {"module": "output_delay", "output": output, "param": "ms", "value": _parse_time_ms(value)}

    # ── Signal Generator ──
    gen_match = re.search(r"\\SignalGenerator\\SV\\(.+)$", path)
    if gen_match:
        param = gen_match.group(1)
        if param == "Signal Generator":
            return {"module": "generator", "param": "mode", "value": value}
        elif param == "Signal Amplitude":
            return {"module": "generator", "param": "level", "value": _parse_db(value)}

    # ── RTA ──
    rta_match = re.search(r"\\RTA\\SV\\(.+)$", path)
    if rta_match:
        param = rta_match.group(1)
        if param == "Rate":
            return {"module": "rta", "param": "rate", "value": value}
        elif param == "Gain":
            return {"module": "rta", "param": "offset", "value": _parse_db(value)}

    return result  # fallback: return path + raw value


def _parse_db(s: str) -> float:
    """Extract number from strings like '-6.0 dB', '-6.0', '0 dB'"""
    m = re.match(r"(-?\d+(?:\.\d+)?)", s)
    return float(m.group(1)) if m else 0.0

def _parse_freq(s: str) -> float:
    """Extract Hz from strings like '1.25 kHz', '250 Hz'"""
    m = re.match(r"(\d+(?:\.\d+)?)\s*(k?Hz)", s)
    if m:
        val = float(m.group(1))
        if m.group(2) == "kHz":
            val *= 1000
        return val
    # might already be a plain number
    try:
        return float(s)
    except:
        return 0.0

def _parse_float(s: str) -> float:
    m = re.match(r"(-?\d+(?:\.\d+)?)", s)
    return float(m.group(1)) if m else 0.0

def _parse_percent(s: str) -> float:
    m = re.match(r"(\d+(?:\.\d+)?)", s)
    return float(m.group(1)) if m else 0.0

def _parse_time_sec(s: str) -> float:
    """Parse time strings like '300 s', '5.0 s/...' to seconds"""
    m = re.match(r"(\d+(?:\.\d+)?)", s)
    return float(m.group(1)) if m else 0.0

def _parse_time_ms(s: str) -> float:
    """Parse time strings to milliseconds. Input might be '25.0 ms' or '0.0250 s/...'"""
    m = re.match(r"(\d+(?:\.\d+)?)\s*(m?s)", s)
    if m:
        val = float(m.group(1))
        if m.group(2) == "s":
            val *= 1000
        return val
    try:
        return float(s) * 1000  # assume seconds
    except:
        return 0.0


def build_read_all_commands(topology: dict = None) -> list[str]:
    """Generate all the get commands to read full PA2 state.
    Uses topology dict to only query modules that exist."""
    cmds = []
    t = topology or {}

    # Device info
    cmds.append("get \\\\Node\\AT\\Class_Name")
    cmds.append("get \\\\Node\\AT\\Instance_Name")
    cmds.append("get \\\\Node\\AT\\Software_Version")
    cmds.append('get "\\\\Storage\\Presets\\SV\\CurrentPreset"')

    # GEQ - use correct paths based on topology
    if t.get("stereo_geq", True):
        geq_paths = ["\\\\Preset\\StereoGEQ"]
    else:
        geq_paths = []
        if t.get("left_geq", False):
            geq_paths.append("\\\\Preset\\LeftGEQ")
        if t.get("right_geq", False):
            geq_paths.append("\\\\Preset\\RightGEQ")

    for geq_base in geq_paths:
        cmds.append(f'get "{geq_base}\\SV\\GraphicEQ"')
        cmds.append(f'get "{geq_base}\\SV\\QuickCurve"')
        for num, label in GEQ_BANDS.items():
            cmds.append(f'get "{geq_base}\\SV\\{label}"')

    # Output PEQ - only query bands that exist
    for output in ["High", "Mid", "Low"]:
        key = f"has_{output.lower()}"
        if not t or t.get(key, True):  # default to True if no topology
            base = f"\\\\Preset\\{output} Outputs PEQ"
            cmds.append(f'get "{base}\\SV\\ParametricEQ"')
            for n in range(1, 9):
                cmds.append(f'get "{base}\\SV\\Band_{n}_Type"')
                cmds.append(f'get "{base}\\SV\\Band_{n}_Frequency"')
                cmds.append(f'get "{base}\\SV\\Band_{n}_Gain"')
                cmds.append(f'get "{base}\\SV\\Band_{n}_Q"')
                cmds.append(f'get "{base}\\SV\\Band_{n}_Slope"')

    # AutoEQ / Room EQ
    cmds.append('get "\\\\Preset\\RoomEQ\\SV\\ParametricEQ"')
    for n in range(1, 9):
        cmds.append(f'get "\\\\Preset\\RoomEQ\\SV\\Band_{n}_Type"')
        cmds.append(f'get "\\\\Preset\\RoomEQ\\SV\\Band_{n}_Frequency"')
        cmds.append(f'get "\\\\Preset\\RoomEQ\\SV\\Band_{n}_Gain"')
        cmds.append(f'get "\\\\Preset\\RoomEQ\\SV\\Band_{n}_Q"')
        cmds.append(f'get "\\\\Preset\\RoomEQ\\SV\\Band_{n}_Slope"')

    # AFS
    if not t or t.get("has_afs", True):
        cmds.append('get \\\\Preset\\Afs\\SV\\AFS')
        cmds.append('get \\\\Preset\\Afs\\SV\\FilterMode')
        cmds.append('get "\\\\Preset\\Afs\\SV\\ContentMode"')
        cmds.append('get \\\\Preset\\Afs\\SV\\MaxFixedFilters')
        cmds.append('get \\\\Preset\\Afs\\SV\\LiftTime')

    # Compressor
    if not t or t.get("has_compressor", True):
        cmds.append('get \\\\Preset\\Compressor\\SV\\Compressor')
        cmds.append('get \\\\Preset\\Compressor\\SV\\Threshold')
        cmds.append('get \\\\Preset\\Compressor\\SV\\Gain')
        cmds.append('get \\\\Preset\\Compressor\\SV\\Ratio')
        cmds.append('get \\\\Preset\\Compressor\\SV\\OverEasy')

    # Limiters - only existing bands
    for output in ["High", "Mid", "Low"]:
        key = f"has_{output.lower()}"
        if not t or t.get(key, True):
            base = f"\\\\Preset\\{output} Outputs Limiter"
            cmds.append(f'get "{base}\\SV\\Limiter"')
            cmds.append(f'get "{base}\\SV\\Threshold"')
            cmds.append(f'get "{base}\\SV\\OverEasy"')

    # Mutes - always try all 6 (device will error on non-existent ones, that's fine)
    for mute in ["HighLeft", "HighRight", "MidLeft", "MidRight", "LowLeft", "LowRight"]:
        cmds.append(f'get \\\\Preset\\OutputGains\\SV\\{mute}OutputMute')

    # Subharmonic
    if not t or t.get("has_subharmonic", True):
        cmds.append('get \\\\Preset\\SubharmonicSynth\\SV\\SubharmonicSynth')
        cmds.append('get \\\\Preset\\SubharmonicSynth\\SV\\Subharmonics')
        cmds.append('get "\\\\Preset\\SubharmonicSynth\\SV\\Synthesis Level 24-36Hz"')
        cmds.append('get "\\\\Preset\\SubharmonicSynth\\SV\\Synthesis Level 36-56Hz"')

    # Input Delay
    cmds.append('get "\\\\Preset\\Back Line Delay\\SV\\Delay"')
    cmds.append('get "\\\\Preset\\Back Line Delay\\SV\\Amount"')

    # Output Delays - only existing bands
    for output in ["High", "Mid", "Low"]:
        key = f"has_{output.lower()}"
        if not t or t.get(key, True):
            base = f"\\\\Preset\\{output} Outputs Delay"
            cmds.append(f'get "{base}\\SV\\Delay"')
            cmds.append(f'get "{base}\\SV\\Amount"')

    # Signal Generator
    cmds.append('get "\\\\Preset\\SignalGenerator\\SV\\Signal Generator"')
    cmds.append('get "\\\\Preset\\SignalGenerator\\SV\\Signal Amplitude"')

    # RTA
    cmds.append('get \\\\Preset\\RTA\\SV\\Rate')
    cmds.append('get \\\\Preset\\RTA\\SV\\Gain')

    return cmds


# ── Command Builder ─────────────────────────────────────────────────

def build_pa2_command(msg: dict, topology: dict = None) -> list[str]:
    """
    Convert a JSON message from the browser into PA2 protocol command(s).
    Returns a list of command strings. Uses topology for device-specific paths.
    """
    action = msg.get("action")
    commands = []
    t = topology or {}

    # Helper: determine GEQ base path
    def geq_base(channel=None):
        ch = channel or msg.get("channel", "")
        if ch == "Left":
            return "\\\\Preset\\LeftGEQ"
        elif ch == "Right":
            return "\\\\Preset\\RightGEQ"
        elif t.get("stereo_geq", True):
            return "\\\\Preset\\StereoGEQ"
        else:
            # Default to Left for dual-mono if no channel specified
            return "\\\\Preset\\LeftGEQ"

    if action == "read_all":
        return build_read_all_commands(topology)

    elif action == "raw":
        # Pass-through for advanced use
        commands.append(msg["command"])

    elif action == "geq_band":
        band_num = int(msg["band"])
        gain = float(msg["gain"])
        gain = max(-12.0, min(12.0, gain))
        label = GEQ_BANDS.get(band_num)
        if label:
            channel = msg.get("channel", "")
            if channel:
                # Specific channel requested
                base = geq_base(channel)
                commands.append(f'set "{base}\\SV\\{label}" {gain}')
            elif t.get("stereo_geq", True):
                # Stereo linked - one command
                base = geq_base()
                commands.append(f'set "{base}\\SV\\{label}" {gain}')
            else:
                # Dual mono - send to both L and R
                commands.append(f'set "\\\\Preset\\LeftGEQ\\SV\\{label}" {gain}')
                commands.append(f'set "\\\\Preset\\RightGEQ\\SV\\{label}" {gain}')

    elif action == "geq_enable":
        enabled = msg.get("enabled", True)
        val = "On" if enabled else "Off"
        channel = msg.get("channel", "")
        if channel:
            base = geq_base(channel)
            commands.append(f'set "{base}\\SV\\GraphicEQ" {val}')
        elif t.get("stereo_geq", True):
            base = geq_base()
            commands.append(f'set "{base}\\SV\\GraphicEQ" {val}')
        else:
            commands.append(f'set "\\\\Preset\\LeftGEQ\\SV\\GraphicEQ" {val}')
            commands.append(f'set "\\\\Preset\\RightGEQ\\SV\\GraphicEQ" {val}')

    elif action == "geq_mode":
        mode = msg["mode"]
        channel = msg.get("channel", "")
        if channel:
            base = geq_base(channel)
            commands.append(f'set "{base}\\SV\\QuickCurve" {mode}')
        elif t.get("stereo_geq", True):
            base = geq_base()
            commands.append(f'set "{base}\\SV\\QuickCurve" {mode}')
        else:
            commands.append(f'set "\\\\Preset\\LeftGEQ\\SV\\QuickCurve" {mode}')
            commands.append(f'set "\\\\Preset\\RightGEQ\\SV\\QuickCurve" {mode}')

    elif action == "peq_filter":
        band = msg["output"]  # "High", "Mid", "Low"
        filt_num = int(msg["filter"])  # 1-8
        base = f"\\\\Preset\\{band} Outputs PEQ"

        if "type" in msg:
            commands.append(f'set "{base}\\SV\\Band_{filt_num}_Type" {msg["type"]}')
        if "freq" in msg:
            commands.append(f'set "{base}\\SV\\Band_{filt_num}_Frequency" {float(msg["freq"]):.2f}')
        if "gain" in msg:
            g = max(-20.0, min(20.0, float(msg["gain"])))
            commands.append(f'set "{base}\\SV\\Band_{filt_num}_Gain" {g:.1f}')
        if "q" in msg:
            commands.append(f'set "{base}\\SV\\Band_{filt_num}_Q" {float(msg["q"]):.1f}')
        if "slope" in msg:
            commands.append(f'set "{base}\\SV\\Band_{filt_num}_Slope" {float(msg["slope"]):.1f}')

    elif action == "peq_enable":
        band = msg["output"]
        enabled = msg.get("enabled", True)
        base = f"\\\\Preset\\{band} Outputs PEQ"
        commands.append(f'set "{base}\\SV\\ParametricEQ" {"On" if enabled else "Off"}')

    elif action == "peq_flatten":
        band = msg["output"]
        restore = msg.get("restore", False)
        base = f"\\\\Preset\\{band} Outputs PEQ"
        commands.append(f'set "{base}\\SV\\Flatten" {"Restore" if restore else "Flat"}')

    elif action == "autoeq_filter":
        filt_num = int(msg["filter"])
        base = "\\\\Preset\\RoomEQ"
        if "type" in msg:
            commands.append(f'set "{base}\\SV\\Band_{filt_num}_Type" {msg["type"]}')
        if "freq" in msg:
            commands.append(f'set "{base}\\SV\\Band_{filt_num}_Frequency" {float(msg["freq"]):.2f}')
        if "gain" in msg:
            g = max(-20.0, min(20.0, float(msg["gain"])))
            commands.append(f'set "{base}\\SV\\Band_{filt_num}_Gain" {g:.1f}')
        if "q" in msg:
            commands.append(f'set "{base}\\SV\\Band_{filt_num}_Q" {float(msg["q"]):.1f}')

    elif action == "autoeq_enable":
        enabled = msg.get("enabled", True)
        commands.append(f'set \\\\Preset\\RoomEQ\\SV\\ParametricEQ {"On" if enabled else "Off"}')

    elif action == "autoeq_mode":
        mode = msg["mode"]  # Flat, Manual, AutoEQ
        commands.append(f'set \\\\Preset\\RoomEQ\\SV\\Flatten {mode}')

    elif action == "afs_enable":
        enabled = msg.get("enabled", True)
        commands.append(f'set \\\\Preset\\Afs\\SV\\AFS {"On" if enabled else "Off"}')

    elif action == "afs_config":
        if "mode" in msg:
            commands.append(f'set \\\\Preset\\Afs\\SV\\FilterMode {msg["mode"]}')
        if "content" in msg:
            commands.append(f'set "\\\\Preset\\Afs\\SV\\ContentMode" {msg["content"]}')
        if "fixed_filters" in msg:
            commands.append(f'set \\\\Preset\\Afs\\SV\\MaxFixedFilters {int(msg["fixed_filters"])}')
        if "lift_time" in msg:
            commands.append(f'set \\\\Preset\\Afs\\SV\\LiftTime {int(msg["lift_time"])}')

    elif action == "afs_clear_live":
        commands.append("set \\\\Preset\\Afs\\SV\\ClearLive On")

    elif action == "afs_clear_all":
        commands.append("set \\\\Preset\\Afs\\SV\\ClearAll On")

    elif action == "generator":
        if "mode" in msg:
            commands.append(f'set "\\\\Preset\\SignalGenerator\\SV\\Signal Generator" {msg["mode"]}')
        if "level" in msg:
            lvl = max(-60, min(0, int(msg["level"])))
            commands.append(f'set "\\\\Preset\\SignalGenerator\\SV\\Signal Amplitude" {lvl}')

    elif action == "mute":
        output = msg["output"]  # HighLeft, HighRight, LowLeft, etc.
        muted = msg.get("muted", True)
        commands.append(f'set \\\\Preset\\OutputGains\\SV\\{output}OutputMute {"On" if muted else "Off"}')

    elif action == "compressor":
        base = "\\\\Preset\\Compressor"
        if "enabled" in msg:
            commands.append(f'set {base}\\SV\\Compressor {"On" if msg["enabled"] else "Off"}')
        if "threshold" in msg:
            commands.append(f'set {base}\\SV\\Threshold {msg["threshold"]}')
        if "gain" in msg:
            commands.append(f'set {base}\\SV\\Gain {msg["gain"]}')
        if "ratio" in msg:
            r = msg["ratio"]
            commands.append(f'set {base}\\SV\\Ratio {r}')
        if "overeasy" in msg:
            commands.append(f'set {base}\\SV\\OverEasy {msg["overeasy"]}')

    elif action == "limiter":
        band = msg["output"]  # "High", "Mid", "Low"
        base = f"\\\\Preset\\{band} Outputs Limiter"
        if "enabled" in msg:
            commands.append(f'set "{base}\\SV\\Limiter" {"On" if msg["enabled"] else "Off"}')
        if "threshold" in msg:
            commands.append(f'set "{base}\\SV\\Threshold" {float(msg["threshold"]):.2f}')
        if "overeasy" in msg:
            commands.append(f'set "{base}\\SV\\OverEasy" {float(msg["overeasy"]):.2f}')

    elif action == "input_delay":
        base = "\\\\Preset\\Back Line Delay"
        if "enabled" in msg:
            commands.append(f'set "{base}\\SV\\Delay" {"On" if msg["enabled"] else "Off"}')
        if "ms" in msg:
            sec = float(msg["ms"]) / 1000.0
            commands.append(f'set "{base}\\SV\\Amount" {sec:.4f}')

    elif action == "subharmonic":
        base = "\\\\Preset\\SubharmonicSynth"
        if "enabled" in msg:
            commands.append(f'set {base}\\SV\\SubharmonicSynth {"On" if msg["enabled"] else "Off"}')
        if "master" in msg:
            commands.append(f'set {base}\\SV\\Subharmonics {msg["master"]}')
        if "lows" in msg:
            commands.append(f'set "{base}\\SV\\Synthesis Level 24-36Hz" {msg["lows"]}')
        if "highs" in msg:
            commands.append(f'set "{base}\\SV\\Synthesis Level 36-56Hz" {msg["highs"]}')

    elif action == "get":
        path = msg["path"]
        commands.append(f'get "{path}"')

    elif action == "list":
        path = msg["path"]
        commands.append(f'ls "{path}"')

    else:
        print(f"[RELAY] Unknown action: {action}")

    return commands


# ── Discovery ───────────────────────────────────────────────────────

def discover_pa2(timeout: float = 5.0) -> Optional[str]:
    """Send UDP broadcast to find PA2 devices. Returns first IP found or None."""
    print("[DISCOVERY] Broadcasting on UDP 19272...")
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    sock.settimeout(timeout)
    sock.bind(("", 0))

    messages = [
        b"delay 100\n",
        b"get \\\\Node\\AT\\Class_Name\n",
        b"get \\\\Node\\AT\\Instance_Name\n",
        b"get \\\\Node\\AT\\Software_Version\n",
    ]
    for msg in messages:
        sock.sendto(msg, ("<broadcast>", PA2_PORT))

    found = {}

    end_time = time.time() + timeout
    while time.time() < end_time:
        try:
            data, addr = sock.recvfrom(2048)
            text = data.decode("utf-8").strip()
            ip = addr[0]
            if ip not in found:
                found[ip] = {}
            if "dbxDriveRackPA2" in text:
                found[ip]["model"] = "dbxDriveRackPA2"
                print(f"[DISCOVERY] Found PA2 at {ip}")
        except socket.timeout:
            break
        except Exception as e:
            print(f"[DISCOVERY] Error: {e}")
            break

    sock.close()

    for ip, info in found.items():
        if info.get("model") == "dbxDriveRackPA2":
            return ip

    return None


# ── WebSocket Server ────────────────────────────────────────────────

async def handle_websocket(websocket, pa2: PA2Connection):
    """Handle a single WebSocket client connection."""
    print(f"[WS] Client connected")

    # Give this client its own response queue
    response_queue: asyncio.Queue = asyncio.Queue(maxsize=500)
    pa2.add_listener(response_queue)

    # Send connection status + topology
    await websocket.send(json.dumps({
        "type": "status",
        "connected": pa2.authenticated,
        "host": pa2.host,
        "topology": pa2.topology,
    }))

    # Forward PA2 responses to this client (parsed + raw)
    async def forward_responses():
        while True:
            try:
                line = await response_queue.get()
                msg = {"type": "pa2_response", "raw": line}
                parsed = parse_pa2_response(line)
                if parsed:
                    msg["parsed"] = parsed
                await websocket.send(json.dumps(msg))
            except Exception:
                break

    forward_task = asyncio.create_task(forward_responses())

    try:
        async for message in websocket:
            try:
                msg = json.loads(message)
                commands = build_pa2_command(msg, topology=pa2.topology)
                for cmd in commands:
                    await pa2.send_command(cmd)
                    await asyncio.sleep(0.02)
            except json.JSONDecodeError:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON",
                }))
            except Exception as e:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": str(e),
                }))
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        forward_task.cancel()
        pa2.remove_listener(response_queue)
        print(f"[WS] Client disconnected")


# ── Main ────────────────────────────────────────────────────────────

async def main():
    parser = argparse.ArgumentParser(description="PA2 WebSocket Relay")
    parser.add_argument("--pa2-host", type=str, default=None,
                        help="PA2 IP address (auto-discovers if not set)")
    parser.add_argument("--pa2-port", type=int, default=PA2_PORT,
                        help=f"PA2 TCP port (default: {PA2_PORT})")
    parser.add_argument("--pa2-password", type=str, default=AUTH_PASS_DEFAULT,
                        help="PA2 password")
    parser.add_argument("--ws-port", type=int, default=8765,
                        help="WebSocket server port (default: 8765)")
    parser.add_argument("--ws-host", type=str, default="0.0.0.0",
                        help="WebSocket bind address (default: 0.0.0.0)")
    args = parser.parse_args()

    # Find PA2
    host = args.pa2_host
    if not host:
        print("[MAIN] No --pa2-host specified, attempting discovery...")
        host = discover_pa2()
        if not host:
            print("[MAIN] No PA2 found on network. Use --pa2-host <IP>")
            sys.exit(1)
        print(f"[MAIN] Auto-discovered PA2 at {host}")

    # Connect to PA2
    pa2 = PA2Connection(host, args.pa2_port, args.pa2_password)
    success = await pa2.connect()
    if not success:
        print("[MAIN] Failed to connect to PA2")
        sys.exit(1)

    # Start WebSocket server
    print(f"[MAIN] WebSocket server starting on ws://{args.ws_host}:{args.ws_port}")
    print(f"[MAIN] Open pa2_control.html in your browser")

    async with ws_serve(
        lambda ws: handle_websocket(ws, pa2),
        args.ws_host,
        args.ws_port,
    ):
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[MAIN] Shutting down")
