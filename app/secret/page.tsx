"use client";

import { useState } from "react";

export default function Secret() {
  const [status, setStatus] = useState("Ready.");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleResetBoard = async () => {
    setIsSubmitting(true);
    setStatus("Reset in progress...");

    try {
      const response = await fetch("/api/pixels/reset", {
        method: "POST",
      });

      if (!response.ok) {
        setStatus("Reset failed.");
        return;
      }

      setStatus("Board was reset to white.");
    } catch {
      setStatus("Network error during reset.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 20, display: "grid", gap: 12 }}>
      <h1>Secret Page</h1>
      <p>Manual controls for board maintenance.</p>
      <button type="button" onClick={handleResetBoard} disabled={isSubmitting}>
        {isSubmitting ? "Resetting..." : "Reset board to white"}
      </button>
      <p aria-live="polite">{status}</p>
    </div>
  );
}
