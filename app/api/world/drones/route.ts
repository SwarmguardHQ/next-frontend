import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    drones: [
      {
        drone_id: "D1",
        position: { x: 5, y: 5 },
        battery: 85,
        status: "flying",
        payload: null,
        assigned_sector: null,
        last_seen: new Date().toISOString(),
        sensors: [
          { type: 'visual', status: 'active', value: 'Clear visibility' },
          { type: 'thermal', status: 'active', value: 'Target 37.2°C detected' },
          { type: 'lidar', status: 'not_installed', value: 'N/A' },
          { type: 'audio', status: 'not_installed', value: 'N/A' }
        ]
      },
      {
        drone_id: "D2",
        position: { x: 10, y: 15 },
        battery: 42,
        status: "scanning",
        payload: null,
        assigned_sector: null,
        last_seen: new Date().toISOString(),
        sensors: [
          { type: 'visual', status: 'offline', value: 'Standby' },
          { type: 'thermal', status: 'not_installed', value: 'N/A' },
          { type: 'lidar', status: 'active', value: 'Mapping grid +12m' },
          { type: 'audio', status: 'damaged', value: 'Interference/Static' }
        ]
      },
      {
        drone_id: "D3",
        position: { x: 0, y: 0 },
        battery: 100,
        status: "idle",
        payload: "medkit",
        assigned_sector: null,
        last_seen: new Date().toISOString(),
        sensors: [
          { type: 'visual', status: 'offline', value: 'Lens cap closed' },
          { type: 'thermal', status: 'offline', value: 'Power deferred' },
          { type: 'lidar', status: 'offline', value: 'Power deferred' },
          { type: 'audio', status: 'offline', value: 'Muted' }
        ]
      }
    ],
    summary: {
      total: 3,
      active: 2,
      offline: 0,
      charging: 0,
      low_battery: []
    }
  });
}