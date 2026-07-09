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
        // Try Mapbox first
        const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          q,
        )}.json?autocomplete=true&proximity=28.2293,-25.7461&limit=10&access_token=${token}`;
        
        let res = await fetch(mapboxUrl, { signal: abortRef.current.signal });
        let json = await res.json();
        let features = json.features || [];
        
        // If no good results, try Overpass API for OSM POI data (better for businesses)
        if (features.length < 3) {
          try {
            // Overpass API query to find nodes/ways with names matching the search in South Africa bbox
            const overpassQuery = `[bbox=-35,16.3,-22,32.8];(node["name"~"${q}",i];way["name"~"${q}",i];);out center;`;
            const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;
            
            const overpassRes = await fetch(overpassUrl, { signal: abortRef.current.signal });
            const overpassData = await overpassRes.json();
            
            if (overpassData.elements && Array.isArray(overpassData.elements)) {
              const overpassFeatures: Feature[] = overpassData.elements
                .filter((el: any) => el.lat && el.lon && el.tags?.name)
                .slice(0, 10)
                .map((el: any, idx: number) => {
                  const lat = el.center?.lat || el.lat;
                  const lon = el.center?.lon || el.lon;
                  const tags = el.tags || {};
                  const name = tags.name || "";
                  const type = tags.amenity || tags.shop || tags.tourism || "location";
                  const fullName = `${name}${tags.addr_street ? ", " + tags.addr_street : ""}${tags.addr_city ? ", " + tags.addr_city : ""}, South Africa`;
                  
                  return {
                    id: `osm-${el.id}`,
                    place_name: fullName,
                    text: name,
                    center: [lon, lat],
                  };
                });
              
              if (overpassFeatures.length > 0) {
                features = overpassFeatures;
              }
            }
          } catch (overpassErr) {
            console.debug("Overpass fallback failed:", overpassErr);
          }
        }
        
        // Third fallback: Nominatim for general places
        if (features.length < 3) {
          try {
            const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
              q
            )}&format=json&limit=10&viewbox=16.3,-35,32.8,-22&bounded=1`;
            
            const nominatimRes = await fetch(nominatimUrl, { signal: abortRef.current.signal });
            const nominatimData = await nominatimRes.json();
            
            if (Array.isArray(nominatimData) && nominatimData.length > 0) {
              const nominatimFeatures: Feature[] = nominatimData.map((item: any, idx: number) => ({
                id: `nominatim-${idx}`,
                place_name: item.display_name,
                text: item.name || item.display_name.split(",")[0],
                center: [parseFloat(item.lon), parseFloat(item.lat)],
              }));
              features = nominatimFeatures;
            }
          } catch (nominatimErr) {
            console.debug("Nominatim fallback failed:", nominatimErr);
          }
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
