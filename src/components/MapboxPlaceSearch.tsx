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
        // South Africa center for proximity bias (Johannesburg): -25.7461, 28.2293
        const proximityCoords = "-25.7461,28.2293";
        // Expand search to include more types and increase limit
        // Remove strict type filtering to get better coverage of South African places
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          q,
        )}.json?autocomplete=true&proximity=${proximityCoords}&limit=10&types=place,region,address,poi&country=${country}&access_token=${token}`;
        
        let res = await fetch(url, { signal: abortRef.current.signal });
        let json = await res.json();
        let features = json.features || [];
        
        // If no results with country filter, try broader search
        if (features.length === 0) {
          const broadUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            q,
          )}.json?autocomplete=true&proximity=${proximityCoords}&limit=10&access_token=${token}`;
          res = await fetch(broadUrl, { signal: abortRef.current.signal });
          json = await res.json();
          features = json.features || [];
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
