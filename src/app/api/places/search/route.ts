import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q");

    if (!q || q.length < 2) {
      return NextResponse.json({ features: [] });
    }

    const results: any[] = [];
    const searchVariations = [
      q, // Original search
      q + " South Africa",
      q + " Johannesburg",
      q + " Cape Town",
    ];

    // Try Nominatim with multiple search variations
    for (const searchTerm of searchVariations) {
      if (results.length >= 15) break;

      try {
        // South Africa bbox: lon 16.3 to 32.8, lat -35 to -22
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchTerm)}&format=json&limit=25&viewbox=16.3,-35,32.8,-22&bounded=0`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(nominatimUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!response.ok) continue;
        
        const data = await response.json();

        if (Array.isArray(data)) {
          const nomResults = data
            .map((item: any) => ({
              id: `nominatim-${item.osm_id}`,
              place_name: item.display_name,
              text: item.name || item.display_name.split(",")[0],
              center: [parseFloat(item.lon), parseFloat(item.lat)],
              address: item.address || {},
              type: item.type,
            }))
            .filter((r: any) => {
              // Filter to South African locations
              const displayName = r.place_name.toLowerCase();
              const address = r.address || {};
              
              return displayName.includes("south africa") ||
                     displayName.includes("johannesburg") ||
                     displayName.includes("gauteng") ||
                     displayName.includes("cape town") ||
                     displayName.includes("durban") ||
                     displayName.includes("western cape") ||
                     displayName.includes("kwazulu") ||
                     displayName.includes("pretoria") ||
                     displayName.includes("sandton") ||
                     address.country === "South Africa" ||
                     address.country_code === "za";
            });

          results.push(...nomResults);
        }
      } catch (err) {
        console.debug(`Search variation "${searchTerm}" failed:`, err instanceof Error ? err.message : err);
        continue;
      }
    }

    // Remove duplicates
    const seen = new Set<string>();
    const unique = results
      .filter((r: any) => {
        const key = r.text.toLowerCase();
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
