"use client";

import { useEffect, useState } from "react";

type VerifyStripeProps = {
  sessionId: string;
};

export default function VerifyStripe({ sessionId }: VerifyStripeProps) {
  const [statusMessage, setStatusMessage] = useState("Verifying payment...");

  useEffect(() => {
    async function verify() {
      try {
        const response = await fetch("/api/payment/verify-stripe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ sessionId }),
        });

        if (response.ok) {
          window.location.href =
            "/passenger?msg=" +
            encodeURIComponent(
              "Payment successful! Your ride has been confirmed. A driver will be assigned shortly."
            );
          return;
        }

        const data = await response.json().catch(() => null);
        setStatusMessage(data?.error ?? "Payment verification failed.");
      } catch (error) {
        if (error instanceof Error) {
          setStatusMessage(error.message);
        } else {
          setStatusMessage("Payment verification failed.");
        }
      }
    }

    verify();
  }, [sessionId]);

  return (
    <div className="alert">
      <strong>Payment status:</strong> {statusMessage}
    </div>
  );
}
