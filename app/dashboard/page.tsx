"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { DronesResponse } from "@/types/api_types";
import { Activity, Battery, CheckCircle2, WifiOff } from "lucide-react";

export default function DashboardPage() {
  const [data, setData] = useState<DronesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Flag to prevent state updates if unmounted
    let isMounted = true;

    const fetchData = async () => {
      try {
        const response = await api.world.getDrones();
        if (isMounted) {
          setData(response);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Failed to fetch drone data. Make sure the backend is running.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData(); // Initial fetch
    
    // Poll the backend every 3 seconds to keep dashboard live
    const interval = setInterval(fetchData, 3000); 

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "idle": return "secondary";
      case "flying":
      case "scanning":
      case "delivering": return "default";
      case "charging": return "outline";
      case "offline": return "destructive";
      default: return "secondary";
    }
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Swarm Dashboard</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total drones */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Drones</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.summary.total || 0}</div>
          </CardContent>
        </Card>
        
        {/* Active drones */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Ops</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.summary.active || 0}</div>
          </CardContent>
        </Card>

        {/* Offline drones */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Offline</CardTitle>
            <WifiOff className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.summary.offline || 0}</div>
          </CardContent>
        </Card>

        {/* Low Battery */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Needs Charge (≤25%)</CardTitle>
            <Battery className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.summary?.low_battery?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Active Fleet</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && !data ? (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="mx-auto h-8 w-8 animate-pulse mb-2 text-primary" />
                Connecting to Mesh Network...
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <WifiOff className="mx-auto h-8 w-8 text-destructive mb-2" />
                <p className="text-destructive font-medium">Connection Error</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Drone ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Battery</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Payload</TableHead>
                    <TableHead className="text-right">Sector Assignment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.drones.map((drone) => (
                    <TableRow key={drone.drone_id}>
                      <TableCell className="font-medium">{drone.drone_id}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(drone.status) as any} className="capitalize">
                          {drone.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="w-10">{drone.battery}%</span>
                          <div className="w-20 h-2 bg-secondary rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-500 ${
                                drone.battery > 50 ? 'bg-green-500' : 
                                drone.battery > 25 ? 'bg-yellow-500' : 'bg-red-500'
                              }`} 
                              style={{ width: `${Math.max(0, drone.battery)}%` }} 
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>({drone.position.x}, {drone.position.y})</TableCell>
                      <TableCell>{drone.payload || "None"}</TableCell>
                      <TableCell className="text-right">{drone.assigned_sector || "Unassigned"}</TableCell>
                    </TableRow>
                  ))}
                  {data?.drones.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No drones detected on the mesh network.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
