import React, { useEffect, useRef, useState } from "react";

type Feature = {
  id: string;
  place_name: string;
  center: [number, number];
  text: string;
  properties?: Record<string, any>;
};

export default function MapboxPlaceSearch({
  onSelect,
  country = "za",
  placeholder = "Search places...",
}: {
  onSelect: (f: Feature) => void;
  country?: string;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(false);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!q || q.length < 2) {
      setResults([]);
      return;
    }
    if (!token) return;

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setLoading(true);
      try {
        // South Africa bounding box: [minLon, minLat, maxLon, maxLat]
        // Approximately: 16.3°E to 32.8°E, -35°S to -22°S
        const saBbox = "16.3,-35,32.8,-22";
        const proximityCoords = "28.2293,-25.7461"; // Johannesburg center
        
        // Search with bbox constraint to ensure results are within South Africa
        // Include all relevant types for places and POIs
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          q,
        )}.json?autocomplete=true&bbox=${saBbox}&proximity=${proximityCoords}&limit=15&types=place,region,address,poi,landmark&access_token=${token}`;
        
        let res = await fetch(url, { signal: abortRef.current.signal });
        let json = await res.json();
        let features = json.features || [];
        
        // If few results, do a secondary search without strict filtering
        if (features.length < 3) {
          const broadUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            q,
          )}.json?autocomplete=true&proximity=${proximityCoords}&limit=15&access_token=${token}`;
          res = await fetch(broadUrl, { signal: abortRef.current.signal });
          json = await res.json();
          const broadFeatures = json.features || [];
          
          // Filter to prioritize South African results
          const saResults = broadFeatures.filter((f: Feature) => {
            const name = (f.place_name || "").toLowerCase();
            return name.includes("south africa") || name.includes("sa") || name.includes("johannesburg") ||
                   name.includes("cape town") || name.includes("durban") || name.includes("pretoria") ||
                   name.includes("gauteng") || name.includes("kwazulu") || name.includes("western cape");
          });
          
          features = saResults.length > 0 ? saResults : broadFeatures.slice(0, 15);
        }
        
        setResults(features);
      } catch (err) {
        if ((err as any).name !== "AbortError") console.error(err);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q, token, country]);

  return (
    <div className="relative w-full">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label="Search places"
        className="w-full rounded border px-3 py-2 text-sm"
      />
      {loading && <div className="absolute right-2 top-3 text-sm">…</div>}
      {results.length > 0 && (
        <ul className="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded bg-white shadow">
          {results.map((f) => (
            <li
              key={f.id}
              className="cursor-pointer border-b px-3 py-2 hover:bg-slate-50"
              onClick={() => {
                setQ(f.place_name);
                setResults([]);
                onSelect(f);
              }}
            >
              <div className="text-sm font-medium">{f.text}</div>
              <div className="text-xs text-gray-500">{f.place_name}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
