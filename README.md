# SwarmguardHQ - Frontend

This is the Next.js frontend application for SwarmguardHQ, a drone fleet orchestration and monitoring system. It provides a real-time digital twin interface, 3D map visualization, and operational mission control capabilities.

## Tech Stack

- **Framework**: Next.js (App Router)
- **UI & Components**: Tailwind CSS, shadcn/ui, Lucide Icons
- **Mapping**: Deck.gl, react-map-gl, Mapbox
- **Data Fetching**: Native Fetch API with custom wrappers

## Getting Started

### Prerequisites
- Node.js (v18+)
- Ensure the SwarmguardHQ `mcp-backend` is running.

### Installation & Setup

1. **Install dependencies:**

```bash
npm install
```

2. **Run the development server:**

```bash
npm run dev
```

3. **Access the application:**
Open [http://localhost:3000](http://localhost:3000) with your browser to explore the dashboard.

## Key Features

- **Fleet Dashboard**: Visualizes overall fleet health, drone states, and real-time battery analytics.
- **Mission Control**: Create, dispatch, and monitor AI-driven operational scenarios (e.g., survivor sweeps, supply runs).
- **Live 3D Map**: A highly interactive digital twin layout representing the geospatial context of drones and targets.
- **Drone Telemetry**: Displays direct metrics such as spatial positioning, velocity, and subsystem diagnostics for individual drone units.
