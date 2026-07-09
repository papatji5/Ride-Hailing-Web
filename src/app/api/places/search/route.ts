import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q");

    if (!q || q.length < 2) {
      return NextResponse.json({ features: [] });
    }

    // Try Photon API (best for OSM-based search)
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=15&bbox=16.3,-35,32.8,-22`;
    const photonRes = await fetch(photonUrl);
    const photonData = await photonRes.json();

    if (photonData.features && photonData.features.length > 0) {
      // Filter and format Photon results
      const results = photonData.features
        .filter((f: any) => {
          const props = f.properties || {};
          // Prioritize South African results
          const country = props.country || "";
          return country.toLowerCase().includes("south africa") ||
                 country === "ZA" ||
                 (props.state && ["Gauteng", "Western Cape", "KwaZulu-Natal", "Eastern Cape", "Northern Cape", "Free State", "Limpopo", "Mpumalanga", "North West"].some(s => props.state.includes(s)));
        })
        .slice(0, 12)
        .map((f: any) => ({
          id: f.properties.osm_id,
          place_name: f.properties.name + (f.properties.city ? `, ${f.properties.city}` : "") + (f.properties.state ? `, ${f.properties.state}` : "") + ", South Africa",
          text: f.properties.name,
          center: [f.geometry.coordinates[0], f.geometry.coordinates[1]],
        }));

      if (results.length > 0) {
        return NextResponse.json({ features: results });
      }
    }

    // Fallback to Nominatim if Photon has few results
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + " South Africa")}&format=json&limit=15&viewbox=16.3,-35,32.8,-22&bounded=1`;
    const nominatimRes = await fetch(nominatimUrl);
    const nominatimData = await nominatimRes.json();

    const results = (Array.isArray(nominatimData) ? nominatimData : [])
      .filter((item: any) => {
        const displayName = item.display_name || "";
        return displayName.includes("South Africa");
      })
      .slice(0, 12)
      .map((item: any, idx: number) => ({
        id: `nominatim-${idx}`,
        place_name: item.display_name,
        text: item.name || item.display_name.split(",")[0],
        center: [parseFloat(item.lon), parseFloat(item.lat)],
      }));

    return NextResponse.json({ features: results });
  } catch (err) {
    console.error("Places search error:", err);
    return NextResponse.json({ features: [] }, { status: 500 });
  }
}
