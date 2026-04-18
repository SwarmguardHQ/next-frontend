"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { getWorldStreamUrl } from "@/lib/backendOrigin";
import type {
  DronesResponse,
  SurvivorsResponse,
  WorldMetricsResponse,
  WorldStreamTickPayload,
} from "@/types/api_types";

export type UseWorldStreamOptions = {
  /** Query param for ``GET /world/stream`` (default 500). */
  intervalMs?: number;
  /** REST poll interval when SSE is not delivering (default 5000). */
  pollingMs?: number;
  /** On initial + fallback poll, fetch mesh log and pass full list (for dashboards). */
  onPollMeshLog?: (meshLog: string[]) => void;
  /** After each SSE ``tick`` (after internal state is updated). */
  onStreamTick?: (payload: WorldStreamTickPayload) => void;
};

export function useWorldStream(options: UseWorldStreamOptions = {}) {
  const {
    intervalMs = 500,
    pollingMs = 5000,
    onPollMeshLog,
    onStreamTick,
  } = options;

  const [droneData, setDroneData] = useState<DronesResponse | null>(null);
  const [survivorData, setSurvivorData] = useState<SurvivorsResponse | null>(null);
  const [worldMetrics, setWorldMetrics] = useState<WorldMetricsResponse | null>(null);
  const [worldStreamLive, setWorldStreamLive] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiLoading, setApiLoading] = useState(true);

  const worldSseOkRef = useRef(false);
  const onStreamTickRef = useRef(onStreamTick);
  const onPollMeshLogRef = useRef(onPollMeshLog);
  onStreamTickRef.current = onStreamTick;
  onPollMeshLogRef.current = onPollMeshLog;

  const fetchRest = useCallback(async () => {
    try {
      const metricsPromise = Promise.resolve(null);
      const meshPromise = onPollMeshLogRef.current
        ? api.world.getMeshLog().catch(() => null)
        : Promise.resolve(null);

      const [dRes, sRes, metricsRes, meshRes] = await Promise.all([
        api.world.getDrones(),
        api.world.getSurvivors(),
        metricsPromise,
        meshPromise,
      ]);

      setDroneData(dRes);
      setSurvivorData(sRes);
      if (metricsRes) setWorldMetrics(metricsRes);
      if (meshRes?.mesh_log?.length && onPollMeshLogRef.current) {
        onPollMeshLogRef.current(meshRes.mesh_log);
      }
      setApiError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Backend unreachable.";
      setApiError(msg);
    } finally {
      setApiLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void fetchRest();
    const id = window.setInterval(() => {
      if (!alive || worldSseOkRef.current) return;
      void fetchRest();
    }, pollingMs);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [fetchRest, pollingMs]);

  useEffect(() => {
    worldSseOkRef.current = false;
    const es = new EventSource(getWorldStreamUrl(intervalMs));

    const onTick = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as WorldStreamTickPayload;
        setDroneData({ drones: data.drones, summary: data.summary });
        setSurvivorData(data.survivors);
        setWorldMetrics(data.metrics);
        worldSseOkRef.current = true;
        setWorldStreamLive(true);
        setApiError(null);
        setApiLoading(false);
        onStreamTickRef.current?.(data);
      } catch {
        /* malformed tick */
      }
    };

    es.addEventListener("tick", onTick);
    es.addEventListener("ping", () => {
      worldSseOkRef.current = true;
      setWorldStreamLive(true);
    });
    es.onerror = () => {
      worldSseOkRef.current = false;
      setWorldStreamLive(false);
      es.close();
    };
    return () => {
      worldSseOkRef.current = false;
      setWorldStreamLive(false);
      es.close();
    };
  }, [intervalMs]);

  return {
    droneData,
    survivorData,
    worldMetrics,
    worldStreamLive,
    apiError,
    apiLoading,
    refetch: fetchRest,
  };
}
