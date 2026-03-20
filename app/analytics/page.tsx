"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Activity, Battery, Clock, Target, ShieldCheck, Wifi, Award } from "lucide-react";
import { 
  PieChart, Pie, Cell, 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, Legend, AreaChart, Area
} from "recharts";

// Mock Data
const droneStatusData = [
  { name: "Flying", value: 12, color: "#10b981" },
  { name: "Charging", value: 4, color: "#f59e0b" },
  { name: "Idle", value: 6, color: "#64748b" },
  { name: "Offline", value: 2, color: "#ef4444" },
];

const missionPerformanceData = [
  { day: "Mon", success: 8, failed: 1 },
  { day: "Tue", success: 12, failed: 0 },
  { day: "Wed", success: 15, failed: 2 },
  { day: "Thu", success: 10, failed: 1 },
  { day: "Fri", success: 18, failed: 0 },
  { day: "Sat", success: 22, failed: 3 },
  { day: "Sun", success: 14, failed: 1 },
];

const survivorNeedsData = [
  { need: "Medical", count: 45 },
  { need: "Water", count: 80 },
  { need: "Food", count: 65 },
  { need: "Shelter", count: 30 },
  { need: "Extraction", count: 25 },
];

const networkLatencyData = [
  { time: "00:00", latency: 45 },
  { time: "04:00", latency: 52 },
  { time: "08:00", latency: 120 }, // Morning rush / interference
  { time: "12:00", latency: 60 },
  { time: "16:00", latency: 48 },
  { time: "20:00", latency: 55 },
  { time: "24:00", latency: 42 },
];

const statCards = [
  { title: "Total Flight Time", value: "1,240 hrs", icon: <Clock className="h-4 w-4 text-muted-foreground" />, trend: "+12% from last week" },
  { title: "Overall Success Rate", value: "94.2%", icon: <Target className="h-4 w-4 text-muted-foreground" />, trend: "+2.1% from last week" },
  { title: "Avg. Response Time", value: "8.5 mins", icon: <Activity className="h-4 w-4 text-muted-foreground" />, trend: "-1.5 mins from last week" },
  { title: "Fleet Readiness", value: "88%", icon: <ShieldCheck className="h-4 w-4 text-muted-foreground" />, trend: "Steady" },
];

export default function AnalyticsPage() {
  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Analytics Dashboard</h2>
      </div>

      {/* Top Stats Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              {stat.icon}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.trend}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Missions Chart */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Mission Performance (Last 7 Days)</CardTitle>
            <CardDescription>Successful vs Failed mission counts</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={missionPerformanceData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                  <RechartsTooltip cursor={{fill: 'rgba(0,0,0,0.1)'}} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                  <Legend iconType="circle" />
                  <Bar dataKey="success" name="Successful" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="failed" name="Failed/Aborted" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Fleet Status Pie Chart */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Current Fleet Status</CardTitle>
            <CardDescription>Distribution of active drone states</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full min-w-0 flex flex-col items-center">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={droneStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {droneStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex gap-4 text-sm mt-2">
                {droneStatusData.map(st => (
                  <div key={st.name} className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: st.color }} />
                    <span className="text-muted-foreground">{st.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Survivor Needs */}
        <Card>
          <CardHeader>
            <CardTitle>Identified Survivor Needs</CardTitle>
            <CardDescription>Aggregated payload requirement requests</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={survivorNeedsData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis dataKey="need" type="category" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <RechartsTooltip cursor={{fill: 'rgba(0,0,0,0.1)'}} contentStyle={{ borderRadius: '8px' }} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Network Health */}
        <Card>
          <CardHeader>
            <CardTitle>Mesh Network Latency (24h)</CardTitle>
            <CardDescription>Average command round-trip time in ms</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={networkLatencyData}>
                  <defs>
                    <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="time" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <RechartsTooltip contentStyle={{ borderRadius: '8px' }} />
                  <Area type="monotone" dataKey="latency" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorLatency)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}