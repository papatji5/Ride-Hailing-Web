import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q");

    if (!q || q.length < 2) {
      return NextResponse.json({ features: [] });
    }

    const results: any[] = [];

    // Try Mapbox Geocoding API (has better business data than Nominatim)
    try {
      const mapboxToken = process.env.MAPBOX_SERVER_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (mapboxToken) {
        // South Africa bbox: 16.3,-35,32.8,-22
        const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?limit=30&bbox=16.3,-35,32.8,-22&proximity=28.2293,-25.7461&access_token=${mapboxToken}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(mapboxUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          if (data.features && Array.isArray(data.features)) {
            const mapboxResults = data.features
              .map((f: any) => ({
                id: f.id,
                place_name: f.place_name,
                text: f.text,
                center: f.center,
                type: f.type,
                source: "mapbox",
              }));
            results.push(...mapboxResults);
          }
        }
      }
    } catch (err) {
      console.debug("Mapbox error:", err instanceof Error ? err.message : err);
    }

    // If Mapbox didn't return enough results, try Nominatim with relaxed filters
    if (results.length < 8) {
      try {
        const variations = [q, q + " South Africa", q + " Johannesburg"];
        
        for (const searchTerm of variations) {
          if (results.length >= 15) break;
          
          const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchTerm)}&format=json&limit=30&viewbox=16.3,-35,32.8,-22&bounded=0`;
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);
          
          try {
            const response = await fetch(nominatimUrl, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (!response.ok) continue;
            
            const data = await response.json();
            if (Array.isArray(data)) {
              const nomResults = data
                .filter((item: any) => {
                  const displayName = (item.display_name || "").toLowerCase();
                  const lat = parseFloat(item.lat);
                  const lon = parseFloat(item.lon);
                  
                  // Check if within SA bounds
                  const inSABounds = lon >= 16.3 && lon <= 32.8 && lat >= -35 && lat <= -22;
                  
                  // Check if location mentions SA
                  const mentionsSA = displayName.includes("south africa") ||
                                    displayName.includes("johannesburg") ||
                                    displayName.includes("gauteng") ||
                                    displayName.includes("cape town") ||
                                    displayName.includes("western cape") ||
                                    displayName.includes("durban") ||
                                    displayName.includes("kwazulu") ||
                                    displayName.includes("pretoria");
                  
                  return inSABounds || mentionsSA;
                })
                .map((item: any) => ({
                  id: `nominatim-${item.osm_id}`,
                  place_name: item.display_name,
                  text: item.name || item.display_name.split(",")[0],
                  center: [parseFloat(item.lon), parseFloat(item.lat)],
                  type: item.type,
                  source: "nominatim",
                }));
              
              results.push(...nomResults);
            }
          } catch (err) {
            console.debug(`Nominatim search "${searchTerm}" error:`, err instanceof Error ? err.message : err);
            clearTimeout(timeoutId);
          }
        }
      } catch (err) {
        console.debug("Nominatim batch error:", err instanceof Error ? err.message : err);
      }
    }

    // Remove duplicates
    const seen = new Set<string>();
    const unique = results
      .filter((r: any) => {
        const key = `${r.center[0]}-${r.center[1]}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 15);

    return NextResponse.json({ features: unique });
  } catch (err) {
    console.error("Places search error:", err);
    return NextResponse.json({ features: [], error: String(err) }, { status: 500 });
  }
}
