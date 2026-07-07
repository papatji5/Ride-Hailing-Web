import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

async function getCurrentUserContext() {
  const authClient = await createClient();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    return { error: "Unauthorized", status: 401 as const };
  }

  const supabase = createServiceRoleClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,role,full_name,email")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return { error: "Profile not found", status: 404 as const };
  }

  return { user, profile, supabase };
}

async function getRideForParticipant(supabase: ReturnType<typeof createServiceRoleClient>, rideId: string, userId: string) {
  const { data: ride, error } = await supabase
    .from("rides")
    .select("id,passenger_id,driver_id,status,pickup_address,dropoff_address")
    .eq("id", rideId)
    .maybeSingle();

  if (error) {
    return { error: error.message, status: 500 as const };
  }

  if (!ride) {
    return { error: "Ride not found", status: 404 as const };
  }

  if (ride.passenger_id !== userId && ride.driver_id !== userId) {
    return { error: "Unauthorized to view messages for this ride", status: 403 as const };
  }

  return { ride };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rideId } = await params;
    const context = await getCurrentUserContext();

    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const rideContext = await getRideForParticipant(context.supabase, rideId, context.user.id);
    if ("error" in rideContext) {
      return NextResponse.json({ error: rideContext.error }, { status: rideContext.status });
    }

    const { data: messages, error } = await context.supabase
      .from("ride_messages")
      .select("id,text,sender_id,sender_role,sender_name,created_at")
      .eq("ride_id", rideId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ messages: messages ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rideId } = await params;
    const body = await req.json().catch(() => null);
    const text = String(body?.text ?? "").trim();

    if (!text) {
      return NextResponse.json({ error: "Message text is required" }, { status: 400 });
    }

    if (text.length > 1000) {
      return NextResponse.json({ error: "Message is too long" }, { status: 400 });
    }

    const context = await getCurrentUserContext();

    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const rideContext = await getRideForParticipant(context.supabase, rideId, context.user.id);
    if ("error" in rideContext) {
      return NextResponse.json({ error: rideContext.error }, { status: rideContext.status });
    }

    const senderName = context.profile.full_name ?? context.profile.email ?? context.profile.role;

    const { data: message, error } = await context.supabase
      .from("ride_messages")
      .insert({
        ride_id: rideId,
        sender_id: context.user.id,
        sender_role: context.profile.role,
        sender_name: senderName,
        text,
      })
      .select("id,text,sender_id,sender_role,sender_name,created_at")
      .single();

    if (error || !message) {
      return NextResponse.json({ error: error?.message ?? "Unable to send message" }, { status: 500 });
    }

    return NextResponse.json({ message });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
