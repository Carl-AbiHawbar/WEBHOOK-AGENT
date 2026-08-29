"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        router.replace("/");
        router.refresh();
      } else {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not sign in.");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Lead Finder</h1>
      <p className="sub">Enter the app password to continue.</p>

      <form onSubmit={submit} className="login">
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </div>
        <button type="submit" disabled={busy}>
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>

      {error && (
        <div className="error">
          <strong>{error}</strong>
        </div>
      )}
    </main>
  );
}
