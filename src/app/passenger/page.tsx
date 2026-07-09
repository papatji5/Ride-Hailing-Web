import Link from "next/link";
import { redirect } from "next/navigation";
import PassengerRidePlanner from "@/components/PassengerRidePlanner";
import PassengerRideSockets from '@/components/PassengerRideSockets';
import PassengerActiveRide from '@/components/PassengerActiveRide';
import VerifyStripe from '@/components/VerifyStripe';
import { requireRole } from "@/lib/auth/require";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PassengerPageProps = {
  searchParams?: Promise<{ msg?: string; error?: string; payment?: string; session?: string }>;
};

function parseOptionalNumber(value: FormDataEntryValue | null) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

async function requestRideAction(formData: FormData) {
  "use server";

  const pickupAddress = String(formData.get("pickup_address") ?? "").trim();
  const dropoffAddress = String(formData.get("dropoff_address") ?? "").trim();

  if (!pickupAddress || !dropoffAddress) {
    redirect("/passenger?error=" + encodeURIComponent("Select a pickup and dropoff on the map before requesting a ride."));
  }

  const user = await requireRole("PASSENGER");
  const supabase = await createClient();

  const paymentMethod = String(formData.get("payment_method") ?? "CASH").toUpperCase();
  const paymentStatus = paymentMethod === "CARD" ? "PENDING" : "UNPAID";
  const scheduledAt = String(formData.get("scheduled_at") ?? "").trim();

  const scheduledAtValue = scheduledAt ? new Date(scheduledAt).toISOString() : null;

  if (scheduledAt && isNaN(Date.parse(scheduledAt))) {
    redirect("/passenger?error=" + encodeURIComponent("Scheduled pickup time is invalid."));
  }

  const { error } = await supabase.from("rides").insert({
    passenger_id: user.id,
    status: "REQUESTED",
    pickup_address: pickupAddress,
    dropoff_address: dropoffAddress,
    pickup_location: null,
    dropoff_location: null,
    scheduled_at: scheduledAtValue,
    estimated_distance_km: parseOptionalNumber(formData.get("estimated_distance_km")),
    estimated_duration_min: parseOptionalNumber(formData.get("estimated_duration_min")),
    estimated_fare_cents: parseOptionalNumber(formData.get("estimated_fare_cents")),
    payment_method: paymentMethod === "CARD" ? "CARD" : "CASH",
    payment_status: paymentStatus,
  });

  if (error) {
    redirect("/passenger?error=" + encodeURIComponent(error.message));
  }

  redirect("/passenger?msg=" + encodeURIComponent("Ride requested."));
}

export default async function PassengerPage(props: PassengerPageProps) {
  const sp = (props.searchParams ? await props.searchParams : {}) as {
    msg?: string;
    error?: string;
    payment?: string;
    session?: string;
  };

  // Handle Stripe payment callback
  const spAny = sp as any;
  const shouldVerify = spAny?.payment === "success" && spAny?.session;

  if (shouldVerify) {
    return <VerifyStripe sessionId={spAny.session} />;
  }

  if (spAny?.payment === "cancelled") {
    // User cancelled Stripe checkout
    redirect(
      "/passenger?error=" +
        encodeURIComponent(
          "Payment was cancelled. Please try again to complete your ride request."
        )
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      <section className="stack">
        <div className="stack">
          <h1>Passenger (Demo)</h1>
          <p className="muted">Supabase is not configured yet. Once you add env vars and create your Supabase project, this page will require login and show passenger features.</p>
        </div>
        <div className="row">
          <Link className="btn" href="/">
            Home
          </Link>
        </div>
      </section>
    );
  }

  const user = await requireRole("PASSENGER");
  const supabase = await createClient();

  const { data: rides, error: ridesError } = await supabase
    .from("rides")
    .select("*")
    .eq("passenger_id", user.id)
    .order("requested_at", { ascending: false })
    .limit(3);

  const activeRide = rides?.find((r: any) => r.status === "ACCEPTED" || r.status === "IN_PROGRESS") ?? null;

  let activeDriver: { full_name?: string | null; phone?: string | null } | null = null;
  let activeVehicle: { make?: string | null; model?: string | null; color?: string | null; plate_number?: string | null } | null = null;

  if (activeRide?.driver_id) {
    const { data: driverProfile } = await supabase
      .from("profiles")
      .select("full_name,phone")
      .eq("id", activeRide.driver_id)
      .maybeSingle();

    activeDriver = driverProfile ?? null;

    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("make,model,color,plate_number")
      .eq("driver_id", activeRide.driver_id)
      .limit(1)
      .maybeSingle();

    activeVehicle = vehicle ?? null;
  }

  return (
    <section className="stack">
      {sp?.msg ? (
        <div className="alert">
          <strong>OK:</strong> {sp.msg}
        </div>
      ) : null}
      {sp?.error ? (
        <div className="alert">
          <strong>Error:</strong> {sp.error}
        </div>
      ) : null}

      {!activeRide ? <PassengerRidePlanner requestRideAction={requestRideAction} /> : null}

      {/* Client-side socket listeners and active ride display */}
      {activeRide ? (
        <>
          <PassengerActiveRide rides={rides ?? []} driver={activeDriver} vehicle={activeVehicle} />
          <PassengerRideSockets rideIds={[activeRide.id]} />
        </>
      ) : null}

      <div className="card stack">
        <h2>Your recent rides</h2>
        {ridesError ? (
          <div className="alert">
            <strong>Ride history error:</strong> {ridesError.message}
          </div>
        ) : rides && rides.length ? (
          <div className="space-y-3">
            {rides.map((r) => {
              const statusColor = 
                r.status === "COMPLETED" ? "text-green-400" :
                r.status === "CANCELLED" ? "text-red-400" :
                "text-blue-400";
              return (
                <div key={r.id} className="rounded-lg border border-white/10 bg-slate-900/50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold uppercase tracking-wide ${statusColor}`}>
                          {r.status}
                        </span>
                        <span className="text-xs text-slate-400">
                          {r.requested_at ? new Date(r.requested_at).toLocaleDateString() : "-"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-100">
                        <strong>{r.pickup_address ?? "(pickup unknown)"}</strong>
                      </p>
                      <p className="text-xs text-slate-400">→</p>
                      <p className="text-sm text-slate-100">
                        <strong>{r.dropoff_address ?? "(dropoff unknown)"}</strong>
                      </p>
                    </div>
                    {r.estimated_fare_cents || r.final_fare_cents ? (
                      <div className="text-right">
                        <p className="text-sm font-semibold text-white">
                          R {((r.final_fare_cents ?? r.estimated_fare_cents) / 100).toFixed(2)}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted">No rides yet.</p>
        )}
      </div>
    </section>
  );
}
