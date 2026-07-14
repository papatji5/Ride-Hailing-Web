"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getSocket } from "@/lib/socket";
import { onRideStatusChanged } from '@/lib/rideSocket';
import type { Feature, LineString } from "geojson";

const CAR_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
  <path fill-rule="evenodd" d="M5.5 3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-13zm0 2h13v10h-13V5z" clip-rule="evenodd"/>
</svg>
`;

type PassengerRideMapProps = {
  rideId: string;
  pickupLat?: number;
  pickupLng?: number;
  pickupAddress: string;
  dropoffLat?: number;
  dropoffLng?: number;
  dropoffAddress: string;
};

export default function PassengerRideMap({
  rideId,
  pickupLat = -26.1305,
  pickupLng = 28.0459,
  pickupAddress,
  dropoffLat = -26.2041,
  dropoffLng = 28.034,
  dropoffAddress,
}: PassengerRideMapProps) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const carMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const pickupMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const dropoffMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [routeGeoJson, setRouteGeoJson] = useState<any>(null);
  const [rideStatus, setRideStatus] = useState<string | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapEl.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      console.error("Mapbox token not found");
      return;
    }

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: mapEl.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [pickupLng, pickupLat],
      zoom: 13,
    });

    mapRef.current = map;

    map.on("load", () => {
      // Add route layer
      if (dropoffLat && dropoffLng) {
        fetchRoute(map, pickupLat, pickupLng, dropoffLat, dropoffLng);
      }

      // Pickup marker (green)
      const pickupEl = createMarkerElement("#10b981");
      pickupMarkerRef.current = new mapboxgl.Marker(pickupEl)
        .setLngLat([pickupLng, pickupLat])
        .addTo(map);

      // Dropoff marker (blue)
      const dropoffEl = createMarkerElement("#3b82f6");
      dropoffMarkerRef.current = new mapboxgl.Marker(dropoffEl)
        .setLngLat([dropoffLng || pickupLng, dropoffLat || pickupLat])
        .addTo(map);

      // Car marker (red with icon)
      const carEl = createCarMarker();
      carMarkerRef.current = new mapboxgl.Marker(carEl)
        .setLngLat([pickupLng, pickupLat])
        .addTo(map);
    });

    return () => {
      map.remove();
    };
  }, [pickupLat, pickupLng, dropoffLat, dropoffLng]);

  // Listen for driver location updates via Socket.IO
  useEffect(() => {
    const socket = getSocket();

    const handleDriverLocation = (data: any) => {
      if (data.rideId === rideId && data.lat && data.lng) {
        setDriverLocation({ lat: data.lat, lng: data.lng });

        // Update car marker position with smooth animation
        if (carMarkerRef.current) {
          const currentLng = carMarkerRef.current.getLngLat().lng;
          const currentLat = carMarkerRef.current.getLngLat().lat;
          
          // Animate to new position
          animateMarkerPosition(carMarkerRef.current, currentLng, currentLat, data.lng, data.lat);
        }

        // Update map to follow car
        if (mapRef.current) {
          mapRef.current.easeTo({
            center: [data.lng, data.lat],
            duration: 1000,
          });
        }
      }
    };

    socket.on("driver-location", handleDriverLocation);
    const offStatus = onRideStatusChanged((payload: any) => {
      try {
        if (!payload || String(payload?.rideId) !== String(rideId)) return;
        setRideStatus(String(payload?.status ?? null));
      } catch (e) {
        // ignore
      }
    });

    return () => {
      socket.off("driver-location", handleDriverLocation);
      offStatus();
    };
  }, [rideId]);

  const haversineMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 6371000; // meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const formatMeters = (m: number) => {
    if (m < 1000) return `${Math.round(m)} m`;
    return `${(m / 1000).toFixed(2)} km`;
  };

  const estimateEtaMinutes = (meters: number, avgKmph = 35) => {
    const speedMs = (avgKmph * 1000) / 3600;
    const secs = meters / speedMs;
    const mins = Math.max(1, Math.round(secs / 60));
    return `${mins} min`;
  };

  const fetchRoute = async (
    map: mapboxgl.Map,
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number
  ) => {
    try {
      const response = await fetch(
        `/api/directions?start=${startLng},${startLat}&end=${endLng},${endLat}`
      );
      const data = await response.json();

      if (data.coordinates) {
        const geoJson: Feature<LineString> = {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: data.coordinates,
          },
        };

        setRouteGeoJson(geoJson);

        // Add route source and layer
        if (!map.getSource("route")) {
          map.addSource("route", {
            type: "geojson",
            data: geoJson,
          });

          map.addLayer(
            {
              id: "route",
              type: "line",
              source: "route",
              layout: {
                "line-join": "round",
                "line-cap": "round",
              },
              paint: {
                "line-color": "#10b981",
                "line-width": 3,
              },
            },
            "poi-label"
          );
        }
      }
    } catch (err) {
      console.error("Error fetching route:", err);
    }
  };

  const animateMarkerPosition = (
    marker: mapboxgl.Marker,
    fromLng: number,
    fromLat: number,
    toLng: number,
    toLat: number,
    duration: number = 1000
  ) => {
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const lng = fromLng + (toLng - fromLng) * progress;
      const lat = fromLat + (toLat - fromLat) * progress;

      marker.setLngLat([lng, lat]);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  };

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Live ride map</div>
      <div
        ref={mapEl}
        style={{
          width: "100%",
          height: "300px",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      />
      {driverLocation && (
        <div className="mt-2 text-xs text-slate-400">
          <div>Driver location: {driverLocation.lat.toFixed(4)}, {driverLocation.lng.toFixed(4)}</div>
          <div className="mt-1 flex gap-3">
            <div className="bg-slate-800/60 px-3 py-2 rounded-md">
              <div className="text-xxs text-slate-300">To pickup</div>
              <div className="text-sm font-medium text-white">
                {formatMeters(haversineMeters(driverLocation.lat, driverLocation.lng, pickupLat, pickupLng))}
                {' • '}
                {estimateEtaMinutes(haversineMeters(driverLocation.lat, driverLocation.lng, pickupLat, pickupLng))}
              </div>
            </div>
            <div className="bg-slate-800/60 px-3 py-2 rounded-md">
              <div className="text-xxs text-slate-300">To destination</div>
              <div className="text-sm font-medium text-white">
                {formatMeters(haversineMeters(driverLocation.lat, driverLocation.lng, dropoffLat || pickupLat, dropoffLng || pickupLng))}
                {' • '}
                {estimateEtaMinutes(haversineMeters(driverLocation.lat, driverLocation.lng, dropoffLat || pickupLat, dropoffLng || pickupLng))}
              </div>
            </div>
          </div>
          {rideStatus ? <div className="mt-1 text-xxs text-slate-400">Status: {rideStatus}</div> : null}
        </div>
      )}
    </div>
  );
}

function createMarkerElement(color: string): HTMLElement {
  const el = document.createElement("div");
  el.style.width = "32px";
  el.style.height = "32px";
  el.style.borderRadius = "50%";
  el.style.backgroundColor = color;
  el.style.border = "2px solid white";
  return el;
}

function createCarMarker(): HTMLElement {
  const el = document.createElement("div");
  el.style.width = "40px";
  el.style.height = "40px";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ef4444" width="32" height="32">
      <path d="M5 11l1.5-4.5h11l1.5 4.5m-13 6h10v2H5z" stroke="white" stroke-width="1" fill="#ef4444"/>
    </svg>
  `;
  return el;
}
