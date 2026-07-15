"use client";

import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";

export default function DriverEtaSection({
  rideId,
  pickupLat,
  pickupLng,
  dropoffLat,
  dropoffLng,
}: {
  rideId: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
}) {
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [toPickup, setToPickup] = useState<{ distance?: number; duration?: number } | null>(null);
  const [toDest, setToDest] = useState<{ distance?: number; duration?: number } | null>(null);

  useEffect(() => {
    const socket = getSocket();

    const handler = async (data: any) => {
      if (!data || String(data.rideId) !== String(rideId)) return;
      if (data.lat == null || data.lng == null) return;
      const loc = { lat: data.lat, lng: data.lng };
      setDriverLocation(loc);
      try {
        window.dispatchEvent(new CustomEvent('driver-location', { detail: { rideId: String(rideId), lat: loc.lat, lng: loc.lng } }));
      } catch (e) {}

      try {
        if (pickupLat != null && pickupLng != null) {
          const pRes = await fetch(`/api/directions?pickup=${data.lng},${data.lat}&dropoff=${pickupLng},${pickupLat}`);
          if (pRes.ok) {
            const pj = await pRes.json();
            setToPickup({ distance: pj.distance, duration: pj.duration });
          }
        }

        if (dropoffLat != null && dropoffLng != null) {
          const dRes = await fetch(`/api/directions?pickup=${data.lng},${data.lat}&dropoff=${dropoffLng},${dropoffLat}`);
          if (dRes.ok) {
            const dj = await dRes.json();
            setToDest({ distance: dj.distance, duration: dj.duration });
          }
        }
      } catch (e) {
        // ignore
      }
    };

    socket.on("driver-location", handler);
    return () => {
      socket.off("driver-location", handler);
    };
  }, [rideId, pickupLat, pickupLng, dropoffLat, dropoffLng]);

  const formatKm = (m?: number) => {
    if (m == null) return "N/A";
    return `${(m / 1000).toFixed(2)} km`;
  };

  const formatDuration = (s?: number) => {
    if (s == null) return "N/A";
    const mins = Math.max(1, Math.round(s / 60));
    return `${mins} min`;
  };

  return (
    <div>
      {driverLocation ? (
        <div className="grid gap-3">
          <div className="text-xs text-slate-400">Driver location</div>
          <div className="text-sm font-semibold text-white">{driverLocation.lat.toFixed(4)}, {driverLocation.lng.toFixed(4)}</div>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-white/10 bg-slate-800/60 p-3">
              <div className="text-xxs text-slate-300">To pickup</div>
              <div className="text-sm font-medium text-white">{formatKm(toPickup?.distance)} • {formatDuration(toPickup?.duration)}</div>
            </div>
            <div className="rounded-md border border-white/10 bg-slate-800/60 p-3">
              <div className="text-xxs text-slate-300">To destination</div>
              <div className="text-sm font-medium text-white">{formatKm(toDest?.distance)} • {formatDuration(toDest?.duration)}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-slate-400">Waiting for driver location...</div>
      )}
    </div>
  );
}
