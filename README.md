# RFID-Meter

An IoT project for **RFID-based authentication over metered resources**. Users tap an RFID card to authenticate, and their usage of a resource (e.g. electricity, water, or time-based access) is tracked, metered, and displayed on a live dashboard.

The hardware side is currently **simulated in [Wokwi](https://wokwi.com/projects/481212520828511233)**, so the whole system can be developed and tested before the physical components are purchased.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [1. Backend (FastAPI)](#1-backend-fastapi)
  - [2. Dashboard (Vite + React)](#2-dashboard-vite--react)
  - [3. Exposing the Backend with Cloudflare](#3-exposing-the-backend-with-cloudflare)
  - [4. Hardware Simulation (Wokwi)](#4-hardware-simulation-wokwi)
- [API Endpoints](#api-endpoints)
- [Hardware Bill of Materials](#hardware-bill-of-materials)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

RFID-Meter lets a device (microcontroller + RFID reader) authenticate users against a backend and meter how much of a shared resource each user consumes.

**Typical flow:**

1. A user taps their RFID card on the reader.
2. The microcontroller sends the card UID to the FastAPI backend.
3. The backend checks whether the card is registered and has sufficient balance/credit.
4. If authorized, the resource is enabled and usage is metered and logged.
5. The dashboard shows users, balances, usage history, and live device activity.

---

## Architecture

```
┌──────────────────────┐        HTTPS         ┌──────────────────────┐
│  Wokwi (simulated)   │ ───────────────────► │  Cloudflare Tunnel   │
│  ESP32 + RFID reader │ ◄─────────────────── │  (public URL)        │
└──────────────────────┘                      └──────────┬───────────┘
                                                         │
                                                         ▼
                                              ┌──────────────────────┐
                                              │  FastAPI Backend     │
                                              │  + SQLite            │
                                              │  (rfid_meter.db)     │
                                              └──────────┬───────────┘
                                                         │ REST
                                                         ▼
                                              ┌──────────────────────┐
                                              │  Vite + React        │
                                              │  Dashboard           │
                                              └──────────────────────┘
```

Wokwi runs in the browser and cannot reach `localhost`, so the local FastAPI server is exposed through a **Cloudflare Tunnel**, giving the simulated device a public HTTPS URL to call.

---

## Tech Stack

| Layer      | Technology                                   |
| ---------- | -------------------------------------------- |
| Backend    | Python, [FastAPI](https://fastapi.tiangolo.com/), SQLite |
| Dashboard  | [Vite](https://vitejs.dev/), React, TypeScript |
| Hardware   | ESP32 + MFRC522 RFID reader *(simulated in Wokwi)* |
| Tunneling  | [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (`cloudflared`) |
| Simulation | [Wokwi](https://wokwi.com/)                  |

> Update the hardware row if you are using a different board (e.g. Arduino, ESP8266).

---

## Project Structure

```
rfid/
├── rfid-meter-backend/        # FastAPI application
│   ├── main.py                # API entry point
│   ├── requirements.txt       # Python dependencies
│   └── rfid_meter.db          # SQLite database (generated at runtime)
│
├── rfid-meter-dashboard/      # Vite + React + TypeScript dashboard
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── App.tsx
│   │   ├── App.css
│   │   ├── main.tsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
└── README.md
```

---

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+ and npm
- A free [Cloudflare](https://www.cloudflare.com/) account (optional for quick tunnels) and [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
- A [Wokwi](https://wokwi.com/) account (free)

### 1. Backend (FastAPI)

```bash
cd rfid-meter-backend

# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate        # Linux/macOS
venv\Scripts\activate           # Windows

# Install dependencies
pip install -r requirements.txt

# Run the server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`, and interactive docs at:

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### 2. Dashboard (Vite + React)

```bash
cd rfid-meter-dashboard

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The dashboard runs at `http://localhost:5173` by default.

If the dashboard needs to know the backend URL, create a `.env` file in `rfid-meter-dashboard/`:

```env
VITE_API_URL=http://localhost:8000
```

### 3. Exposing the Backend with Cloudflare

Wokwi runs in the cloud/browser, so it can't call `localhost`. Use a Cloudflare Tunnel to expose the backend.

**Quick tunnel (no account/domain needed):**

```bash
cloudflared tunnel --url http://localhost:8000
```

`cloudflared` prints a public URL such as:

```
https://random-words-1234.trycloudflare.com
```

Copy this URL; it is the base URL your Wokwi firmware will call.

> **Note:** Quick tunnel URLs change every time you restart `cloudflared`. For a stable URL, set up a [named tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/) with your own domain.

You should also allow the tunnel origin in the backend CORS settings if the dashboard is served from a different origin.

### 4. Hardware Simulation (Wokwi)

1. Create a new ESP32 project on [wokwi.com](https://wokwi.com/).
2. Add an RFID reader (MFRC522) and wire it to the ESP32 (SPI pins).
3. Add any indicators you want: LEDs, a buzzer, an LCD/OLED, or a relay to represent the metered resource.
4. In your firmware, set the API base URL to your Cloudflare tunnel URL:

   ```cpp
   const char* serverurl = "https://random-words-1234.trycloudflare.com";
   cosnt char* deducturl = "https://random-words-1234.trycloudflare.com";
   ```

5. Use Wokwi's built-in WiFi (`Wokwi-GUEST`) so the simulated board has internet access:

   ```cpp
   const char* WIFI_SSID = "Wokwi-GUEST";
   const char* WIFI_PASSWORD = "";
   ```

6. Start the simulation and simulate a card tap to see the request hit your backend.

> Add a link to your Wokwi project here once it's public: `https://wokwi.com/projects/481212520828511233`

---

## API Endpoints


| Method | Endpoint              | Description                                  |
| ------ | --------------------- | -------------------------------------------- |
| `POST` | `/auth`               | Authenticate an RFID card UID                |
| `POST` | `/usage`              | Record metered usage for an authenticated card |
| `GET`  | `/users`              | List registered users/cards                  |
| `POST` | `/users`              | Register a new card/user                     |
| `GET`  | `/users/{uid}`        | Get a user's details and balance             |
| `GET`  | `/logs`               | Retrieve usage and access logs               |

**Example request from the device:**

```bash
curl -X POST https://<your-tunnel>.trycloudflare.com/auth \
  -H "Content-Type: application/json" \
  -d '{"uid": "04:A3:2B:1C"}'
```

**Example response:**

```json
{
  "authorized": true,
  "user": "Jane Doe",
  "balance": 50
}
```

Full, always-up-to-date documentation is available at `/docs` when the backend is running.

---

## Hardware Bill of Materials

Planned components for the physical build:

| Component                    | Purpose                              |
| ---------------------------- | ------------------------------------ |
| ESP32 development board      | Microcontroller with WiFi            |
| MFRC522 RFID reader          | Reads RFID card/tag UIDs             |
| RFID cards / key fobs        | User credentials                     |
| Relay module                 | Switches the metered resource on/off |
| Flow / energy sensor         | Measures consumption                 |
| LCD / OLED display (optional)| Shows balance and status             |

---

## Roadmap

- [x] FastAPI backend with SQLite storage
- [x] Vite + React dashboard scaffold
- [x] Wokwi simulation of the RFID device
- [x] Public tunnel via Cloudflare for simulator access
- [ ] Complete user and balance management in the dashboard
- [ ] Real-time updates (WebSockets / SSE)
- [ ] Authentication for dashboard admins
- [ ] Token-based device authentication (API keys)
- [ ] Migrate from SQLite to PostgreSQL for production
- [ ] Deploy backend and dashboard
- [ ] Port firmware to physical hardware

---

## Contributing

Contributions, issues, and feature requests are welcome. Feel free to open an issue or submit a pull request.

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "Add my feature"`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a pull request

---

## License

This project is licensed under the [MIT License](LICENSE). *(Update this section if you choose a different license.)*
