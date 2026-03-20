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
        last_seen: new Date().toISOString()
      },
      {
        drone_id: "D2",
        position: { x: 10, y: 15 },
        battery: 42,
        status: "scanning",
        payload: null,
        assigned_sector: null,
        last_seen: new Date().toISOString()
      },
      {
        drone_id: "D3",
        position: { x: 0, y: 0 },
        battery: 100,
        status: "idle",
        payload: "medkit",
        assigned_sector: null,
        last_seen: new Date().toISOString()
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