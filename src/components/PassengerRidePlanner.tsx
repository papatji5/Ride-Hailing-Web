"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

type Suggestion = { id: string; place_name: string; center: [number, number] };
type RouteFeature = GeoJSON.Feature<GeoJSON.LineString>;

type FeaturedDriver = {
  name: string;
  phone: string;
  car: string;
  plate: string;
  driverPhotoSrc: string;
  driverPhotoAlt: string;
  carPhotoSrc: string;
  carPhotoAlt: string;
  notes: string;
};

const featuredDriver: FeaturedDriver = {
  name: "austine",
  phone: "0735163121",
  car: "2023 Mercedes-Benz C-Class C200 Avantgarde",
  plate: "LG35FX GP",
  driverPhotoSrc: "/professional_portrait.png",
  driverPhotoAlt: "Austine driver profile photo",
  carPhotoSrc: "/Mercedes_Benz_C200_Clean.png",
  carPhotoAlt: "Mercedes-Benz C200 clean car image",
  notes: "Available for Johannesburg and Pretoria trips during the MVP pilot.",
};

type RidePlannerProps = {
  requestRideAction: (formData: FormData) => void | Promise<void>;
};

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const radiusMeters = 6371e3;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radiusMeters * c;
}

export default function PassengerRidePlanner({ requestRideAction }: RidePlannerProps) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapFormEl = useRef<HTMLDivElement | null>(null);
  const mapFormRef = useRef<mapboxgl.Map | null>(null);
  const pickupMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const dropoffMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const suggestTimer = useRef<number | null>(null);

  const [pickup, setPickup] = useState<{ lng: number; lat: number } | null>(null);
  const [dropoff, setDropoff] = useState<{ lng: number; lat: number } | null>(null);
  const [pickupAddress, setPickupAddress] = useState<string | null>(null);
  const [dropoffAddress, setDropoffAddress] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<string>("idle");
  const [geoError, setGeoError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD">("CASH");
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [straightDistance, setStraightDistance] = useState<number | null>(null);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const [fetchingRoute, setFetchingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeFeature, setRouteFeature] = useState<RouteFeature | null>(null);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
    if (!token) return;
    mapboxgl.accessToken = token;

    const isMobile = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 767px)").matches;

    // Initialize mobile form map if on small screens
    if (isMobile && mapFormEl.current) {
      const fm = new mapboxgl.Map({
        container: mapFormEl.current,
        style: "mapbox://styles/mapbox/streets-v11",
        center: [28.0473, -26.2041],
        zoom: 12,
      });
      mapFormRef.current = fm;

      fm.on("load", () => {
        if (!fm.getSource("route")) {
          fm.addSource("route", {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
          });
        }

        if (!fm.getLayer("route-line")) {
          fm.addLayer({
            id: "route-line",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#22c55e", "line-width": 5, "line-opacity": 0.9 },
          });
        }
      });

      fm.on("click", (e: any) => {
        const { lng, lat } = e.lngLat;
        setDropoff({ lng, lat });
      });

      return () => fm.remove();
    }

    // Otherwise initialize the larger desktop map
    if (mapEl.current) {
      const map = new mapboxgl.Map({
        container: mapEl.current,
        style: "mapbox://styles/mapbox/streets-v11",
        center: [28.0473, -26.2041],
        zoom: 12,
      });
      mapRef.current = map;

      map.on("load", () => {
        if (!map.getSource("route")) {
          map.addSource("route", {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
          });
        }

        if (!map.getLayer("route-line")) {
          map.addLayer({
            id: "route-line",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#22c55e", "line-width": 5, "line-opacity": 0.9 },
          });
        }
      });

      map.on("click", (e: any) => {
        const { lng, lat } = e.lngLat;
        setDropoff({ lng, lat });
      });

      return () => map.remove();
    }
  }, []);



  async function reverseGeocode(lng: number, lat: number) {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
    if (!token) return null;

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&limit=1`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      return data.features?.[0]?.place_name ?? null;
    } catch {
      return null;
    }
  }

  async function detectPickup() {
    if (!navigator.geolocation) {
      setGeoStatus("unsupported");
      setGeoError("Geolocation API not available in this browser.");
      return;
    }

    setGeoStatus("requesting");
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setPickup({ lng, lat });
        setGeoStatus("granted");
        const activeMap = mapFormRef.current ?? mapRef.current;
        if (activeMap) activeMap.flyTo({ center: [lng, lat], zoom: 14 });
      },
      (err) => {
        setGeoStatus("error");
        if (err && err.code === 1) {
          setGeoError("Permission denied. Allow location access in the browser.");
        } else if (err && err.code === 3) {
          setGeoError("Position unavailable or timeout. Try again.");
        } else {
          setGeoError(err?.message ?? "Unknown geolocation error.");
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  useEffect(() => {
    detectPickup();
  }, []);

  useEffect(() => {
    const map = mapFormRef.current ?? mapRef.current;
    if (!map) return;

    pickupMarkerRef.current?.remove();
    if (pickup) {
      pickupMarkerRef.current = new mapboxgl.Marker({ color: "#06b6d4" })
        .setLngLat([pickup.lng, pickup.lat])
        .addTo(map);
    }

    dropoffMarkerRef.current?.remove();
    if (dropoff) {
      dropoffMarkerRef.current = new mapboxgl.Marker({ color: "#06d65f" })
        .setLngLat([dropoff.lng, dropoff.lat])
        .addTo(map);
    }
  }, [pickup, dropoff]);

  useEffect(() => {
    (async () => {
      if (pickup) {
        setPickupAddress("Resolving address...");
        const resolved = await reverseGeocode(pickup.lng, pickup.lat);
        setPickupAddress(resolved ?? "(address not found)");
      }
      if (dropoff) {
        setDropoffAddress("Resolving address...");
        const resolved = await reverseGeocode(dropoff.lng, dropoff.lat);
        setDropoffAddress(resolved ?? "(address not found)");
      }
    })();
  }, [pickup, dropoff]);

  useEffect(() => {
    setRouteDistance(null);
    setRouteDuration(null);
    setRouteError(null);
    setRouteFeature(null);

    if (!pickup || !dropoff) {
      setStraightDistance(null);
      return;
    }

    const meters = haversineDistance(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
    setStraightDistance(meters);

    (async () => {
      try {
        setFetchingRoute(true);
        const res = await fetch(
          `/api/directions?pickup=${pickup.lng},${pickup.lat}&dropoff=${dropoff.lng},${dropoff.lat}`,
        );
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setRouteError(data?.detail ?? data?.error ?? "Route request failed");
          return;
        }

        const data = await res.json();
        if (data?.distance != null) setRouteDistance(data.distance);
        if (data?.duration != null) setRouteDuration(data.duration);
        if (data?.geometry?.coordinates) {
          setRouteFeature({
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: data.geometry.coordinates,
            },
          });
        } else {
          setRouteError("No route geometry returned");
        }
      } catch {
        setRouteError("Unable to load route from Mapbox");
      } finally {
        setFetchingRoute(false);
      }
    })();
  }, [pickup, dropoff]);

  useEffect(() => {
    const map = mapFormRef.current ?? mapRef.current;
    if (!map || !routeFeature) return;
    const source = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
    source?.setData(routeFeature as GeoJSON.Feature);
  }, [routeFeature]);

  useEffect(() => {
    if (suggestTimer.current) {
      window.clearTimeout(suggestTimer.current);
      suggestTimer.current = null;
    }

    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    setLoadingSuggestions(true);
    suggestTimer.current = window.setTimeout(async () => {
      try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&autocomplete=true&limit=6&country=za`;
        const res = await fetch(url);
        const data = await res.json();
        const items: Suggestion[] = (data.features || []).map((feature: any) => ({
          id: feature.id,
          place_name: feature.place_name,
          center: feature.center,
        }));
        setSuggestions(items);
      } catch {
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 300);

    return () => {
      if (suggestTimer.current) window.clearTimeout(suggestTimer.current);
    };
  }, [query]);

  function selectSuggestion(suggestion: Suggestion) {
    const [lng, lat] = suggestion.center;
    setDropoff({ lng, lat });
    setDropoffAddress(suggestion.place_name);
    setQuery(suggestion.place_name);
    setSuggestions([]);
    const map = mapFormRef.current ?? mapRef.current;
    if (map) map.flyTo({ center: [lng, lat], zoom: 15 });
  }

  async function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    async function parseResponse(res: Response) {
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        return { error: text };
      }
    }

    if (paymentMethod === "CASH") {
      // Direct cash payment: submit form immediately
      const formData = new FormData(e.currentTarget);
      await requestRideAction(formData);
    } else if (paymentMethod === "CARD") {
      // Card payment: create ride + redirect to Stripe checkout
      if (!fareEstimate || !pickupAddressValue || !dropoffAddressValue) {
        setPaymentError("Cannot calculate fare or missing location. Please try again.");
        return;
      }

      setPaymentProcessing(true);
      try {
        // Fetch user email for Stripe
        const emailRes = await fetch("/api/auth/user");
        const emailData = await parseResponse(emailRes);
        const email = emailData?.email || "passenger@example.com";

        // Create a pending ride on the server
        const createRideRes = await fetch("/api/rides/create-pending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pickup_address: pickupAddressValue,
            dropoff_address: dropoffAddressValue,
            estimated_distance_km: effectiveDistance ? effectiveDistance / 1000 : null,
            estimated_duration_min: effectiveDuration ? effectiveDuration / 60 : null,
            estimated_fare_cents: fareEstimate ? Math.round(fareEstimate.fare * 100) : null,
            payment_method: "CARD",
          }),
        });

        const rideData = await parseResponse(createRideRes);
        if (!createRideRes.ok || !rideData?.rideId) {
          setPaymentError(rideData?.error || rideData?.message || "Failed to create ride before payment");
          setPaymentProcessing(false);
          return;
        }

        const rideId = String(rideData.rideId);
        const amount = fareEstimate ? Math.round(fareEstimate.fare * 100) : 0;

        // Initialize Stripe checkout
        const stripeRes = await fetch("/api/payment/initialize-stripe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            amount_cents: amount,
            ride_id: rideId,
          }),
        });

        const stripeData = await parseResponse(stripeRes);
        if (!stripeRes.ok || !stripeData?.url) {
          setPaymentError(stripeData?.error || stripeData?.message || "Failed to initialize payment");
          setPaymentProcessing(false);
          return;
        }

        // Redirect to Stripe checkout
        window.location.href = stripeData.url;
      } catch (err) {
        setPaymentError(err instanceof Error ? err.message : "Payment initialization failed");
        setPaymentProcessing(false);
      }
    }
  }


  const fareConfig = {
    // Uber Black Premium Pricing
    baseFare: 32, // Higher base for premium service
    perKm: 20, // Premium per-km rate
    perMinute: 2.8, // Premium per-minute rate
    minFare: 65, // Higher minimum for premium rides
    surge: 1, // 1x = no surge (can be adjusted for peak times)
    avgSpeedKmph: 30,
  };

  function computeFare(distanceMeters: number | null, durationSeconds: number | null) {
    if (distanceMeters == null) return null;
    const km = distanceMeters / 1000;
    const minutes = durationSeconds != null ? durationSeconds / 60 : (km / fareConfig.avgSpeedKmph) * 60;
    const distanceCharge = fareConfig.perKm * km;
    const timeCharge = fareConfig.perMinute * minutes;
    const fare = Math.max(fareConfig.minFare, (fareConfig.baseFare + distanceCharge + timeCharge) * fareConfig.surge);
    return {
      fare: Math.round(fare * 100) / 100,
      breakdown: {
        base: fareConfig.baseFare,
        distanceCharge: Math.round(distanceCharge * 100) / 100,
        timeCharge: Math.round(timeCharge * 100) / 100,
      },
    };
  }

  function formatMeters(value?: number | null) {
    if (value == null) return "N/A";
    if (value >= 1000) return `${(value / 1000).toFixed(2)} km`;
    return `${Math.round(value)} m`;
  }

  function formatMinutes(value?: number | null) {
    if (value == null) return "N/A";
    return `${Math.max(1, Math.round(value / 60))} min`;
  }

  const effectiveDistance = routeDistance ?? straightDistance;
  const fallbackEtaSeconds = straightDistance != null ? straightDistance / (fareConfig.avgSpeedKmph * 1000 / 3600) : null;
  const effectiveDuration = routeDuration ?? fallbackEtaSeconds;
  const fareEstimate = computeFare(effectiveDistance, effectiveDuration);

  const pickupAddressValue = pickupAddress && pickupAddress !== "Resolving address..." ? pickupAddress : "";
  const dropoffAddressValue = dropoffAddress && dropoffAddress !== "Resolving address..." ? dropoffAddress : "";
  const canRequestRide = Boolean(pickup && dropoff && pickupAddressValue && dropoffAddressValue);

  return (
    <section className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,1fr)]">
      <div className="flex min-h-[280px] md:min-h-[520px] lg:min-h-[760px] flex-col rounded-xl border border-white/10 bg-slate-900 p-3 hidden md:flex">
        <div ref={mapEl} className="min-h-[240px] md:min-h-[480px] lg:min-h-[760px] w-full flex-1 rounded-md" />
      </div>

      <form onSubmit={handleFormSubmit} className="space-y-4 rounded-xl border border-white/10 bg-white/3 p-4">
        {/* Mobile-only compact map above dropoff */}
        <div className="block md:hidden">
          <div className="rounded-xl border border-white/10 bg-slate-900 p-2 mb-3">
            <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Live ride map</div>
            <div
              ref={mapFormEl}
              style={{ width: "100%", height: "220px", borderRadius: 8, overflow: "hidden" }}
            />
          </div>
        </div>
        <div>
          <p className="text-sm text-slate-300">Passenger ride request</p>
          <h2 className="mt-1 text-xl font-semibold text-white">Pick a dropoff and request a ride</h2>
          <p className="mt-1 text-sm text-slate-400">Your pickup can be detected automatically or moved to the map center.</p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-cyan-400/20 bg-slate-950/80 shadow-lg shadow-cyan-500/10">
          <div className="flex items-start gap-4 p-4">
            <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
              <Image src={featuredDriver.driverPhotoSrc} alt={featuredDriver.driverPhotoAlt} fill className="object-cover" sizes="128px" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                  Featured driver
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                  One-driver pilot
                </span>
              </div>
              <div className="mt-2">
                <h3 className="truncate text-lg font-semibold text-white">{featuredDriver.name}</h3>
                <a
                  href={`tel:${featuredDriver.phone.replace(/\s+/g, "")}`}
                  className="mt-1 block text-sm font-medium text-cyan-200 hover:underline"
                >
                  {featuredDriver.phone}
                </a>
                <p className="mt-1 text-sm text-slate-400">{featuredDriver.notes}</p>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 bg-white/5 text-sm">
            <div className="bg-slate-950/90 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">Car</div>

              <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-slate-900 p-3 h-72 flex items-center justify-center">
                <Image
                  src={featuredDriver.carPhotoSrc}
                  alt={featuredDriver.carPhotoAlt}
                  width={1600}
                  height={800}
                  className="object-contain h-full w-auto"
                />
              </div>

              <div className="mt-3 font-medium text-white">{featuredDriver.car}</div>
              <div className="mt-1 text-slate-400">Registration: {featuredDriver.plate}</div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-slate-900/80 p-3 text-sm text-slate-200">
          <div className="text-xs uppercase tracking-wide text-slate-400">Pickup</div>
          <div className="mt-1 font-medium text-white">
            {pickup ? `${pickup.lat.toFixed(6)}, ${pickup.lng.toFixed(6)}` : geoStatus === "requesting" ? "Detecting..." : "Not detected"}
          </div>
          <div className="mt-1 text-xs text-slate-400">{pickupAddress ?? (geoStatus === "requesting" ? "Resolving address..." : "")}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 px-3 py-2 text-sm font-semibold text-white"
              onClick={() => detectPickup()}
            >
              Retry detect pickup
            </button>
            <button
              type="button"
              className="rounded-full border border-white/10 px-3 py-2 text-sm text-white"
              onClick={() => {
                const activeMap = mapFormRef.current ?? mapRef.current;
                if (activeMap) {
                  const center = activeMap.getCenter();
                  setPickup({ lng: center.lng, lat: center.lat });
                  setPickupAddress(null);
                }
              }}
            >
              Use map center as pickup
            </button>
          </div>
          {geoError ? <div className="mt-2 text-xs text-rose-400">{geoError}</div> : null}
        </div>

        <div className="rounded-lg border border-white/10 bg-slate-900/80 p-3 text-sm text-slate-200">
          <div className="text-xs uppercase tracking-wide text-slate-400">Dropoff</div>
          <div className="mt-2">
            <input
              className="w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500"
              placeholder="Type an address or place"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search dropoff location"
            />
            {loadingSuggestions ? <div className="mt-2 text-xs text-slate-400">Searching...</div> : null}
            {suggestions.length > 0 ? (
              <ul className="mt-2 max-h-48 overflow-auto rounded-md border border-white/10 bg-slate-950 p-1 text-sm">
                {suggestions.map((suggestion) => (
                  <li
                    key={suggestion.id}
                    className="cursor-pointer rounded px-2 py-1 hover:bg-white/5"
                    onClick={() => selectSuggestion(suggestion)}
                  >
                    {suggestion.place_name}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="mt-3 text-xs text-slate-400">Selected:</div>
          <div className="mt-1 font-medium text-white">
            {dropoffAddress ?? (dropoff ? `${dropoff.lat.toFixed(6)}, ${dropoff.lng.toFixed(6)}` : "Click map or pick suggestion")}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-slate-900/80 p-3 text-sm text-slate-200">
          <div className="text-xs uppercase tracking-wide text-slate-400">Estimate</div>
          <div className="mt-2 font-medium text-white">Straight: {formatMeters(straightDistance)}</div>
          <div className="text-sm text-slate-400">Route: {routeDistance ? formatMeters(routeDistance) : "N/A"} - ETA: {formatMinutes(routeDuration ?? fallbackEtaSeconds)}</div>
          {fetchingRoute ? <div className="mt-1 text-xs text-slate-400">Fetching route...</div> : null}
          {routeError ? <div className="mt-1 text-xs text-rose-400">{routeError}</div> : null}
          {!routeError && !routeDistance && pickup && dropoff ? <div className="mt-1 text-xs text-amber-300">Using straight-line ETA until Mapbox route is available.</div> : null}
          <div className="mt-3 text-xs uppercase tracking-wide text-slate-400">Estimated fare</div>
          <div className="mt-1 text-xl font-semibold text-white">{fareEstimate ? `R ${fareEstimate.fare.toFixed(2)}` : "N/A"}</div>
          {fareEstimate ? (
            <div className="mt-1 text-sm text-slate-400">
              Breakdown: Base R{fareEstimate.breakdown.base} + Distance R{fareEstimate.breakdown.distanceCharge} + Time R{fareEstimate.breakdown.timeCharge}
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-white/10 bg-slate-900/80 p-3 text-sm text-slate-200">
          <div className="text-xs uppercase tracking-wide text-slate-400">Payment method</div>
          <div className="mt-3 grid gap-3">
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950 px-3 py-3 cursor-pointer">
              <input
                type="radio"
                name="payment_method"
                value="CASH"
                checked={paymentMethod === "CASH"}
                onChange={() => setPaymentMethod("CASH")}
                className="h-4 w-4 text-cyan-400"
              />
              <div>
                <div className="font-medium text-white">Cash</div>
                <div className="text-xs text-slate-400">Pay the driver in cash on arrival.</div>
              </div>
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950 px-3 py-3 cursor-pointer">
              <input
                type="radio"
                name="payment_method"
                value="CARD"
                checked={paymentMethod === "CARD"}
                onChange={() => setPaymentMethod("CARD")}
                className="h-4 w-4 text-cyan-400"
              />
              <div>
                <div className="font-medium text-white">Card</div>
                <div className="text-xs text-slate-400">Pay by card via Stripe (test mode).</div>
              </div>
            </label>
          </div>
          {paymentError ? (
            <div className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-300">
              {paymentError}
            </div>
          ) : null}
        </div>

        <input type="hidden" name="payment_method" value={paymentMethod} />
        <input type="hidden" name="pickup_address" value={pickupAddressValue} />
        <input type="hidden" name="dropoff_address" value={dropoffAddressValue} />
        <input type="hidden" name="pickup_lng" value={pickup?.lng?.toString() ?? ""} />
        <input type="hidden" name="pickup_lat" value={pickup?.lat?.toString() ?? ""} />
        <input type="hidden" name="dropoff_lng" value={dropoff?.lng?.toString() ?? ""} />
        <input type="hidden" name="dropoff_lat" value={dropoff?.lat?.toString() ?? ""} />
        <input type="hidden" name="estimated_distance_km" value={effectiveDistance != null ? (effectiveDistance / 1000).toFixed(3) : ""} />
        <input type="hidden" name="estimated_duration_min" value={effectiveDuration != null ? (effectiveDuration / 60).toFixed(2) : ""} />
        <input type="hidden" name="estimated_fare_cents" value={fareEstimate ? Math.round(fareEstimate.fare * 100).toString() : ""} />

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="submit"
            className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canRequestRide || paymentProcessing}
          >
            {paymentProcessing ? "Redirecting to payment..." : "Request ride"}
          </button>
          <button
            type="button"
            className="rounded-full border border-white/10 px-4 py-2 text-sm text-white"
            onClick={() => {
              setQuery("");
              setSuggestions([]);
              setDropoff(null);
              setDropoffAddress(null);
              setRouteDistance(null);
              setRouteDuration(null);
              setRouteError(null);
              setRouteFeature(null);
            }}
          >
            Clear dropoff
          </button>
        </div>
        {paymentProcessing && paymentMethod === "CARD" ? (
          <div className="mt-2 rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-100">
            Redirecting to Stripe payment...
          </div>
        ) : null}
      </form>


    </section>
  );
}
