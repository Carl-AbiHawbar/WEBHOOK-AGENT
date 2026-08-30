"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { leadsToCsv, csvFilename } from "@/lib/csv";
import type { Lead } from "@/lib/types";

interface TradeBreakdown {
  trade: string;
  leads: number;
  scanned: number;
  error?: string;
}

interface Results {
  leads: Lead[];
  requestsUsed: number;
  fromCache: boolean;
  /** Present on an automatic sweep. */
  totalScanned?: number;
  byTrade?: TradeBreakdown[];
  radiusMeters?: number;
  /** Present on a manual search. */
  totalFound?: number;
  withWebsite?: number;
  query?: string;
}

interface ApiError {
  error: string;
  hint?: string;
}

type Stage = "locating" | "sweeping" | "idle";

function scoreClass(score: number): string {
  if (score >= 60) return "hot";
  if (score >= 30) return "warm";
  return "cool";
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("locating");
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [label, setLabel] = useState("near you");

  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [manualBusy, setManualBusy] = useState(false);

  // React mounts twice in dev; without this guard the sweep would bill twice.
  const started = useRef(false);

  const runSweep = useCallback(async (latitude: number, longitude: number) => {
    setStage("sweeping");
    setError(null);

    try {
      const response = await fetch("/api/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude, longitude }),
      });
      const data = await response.json();

      if (!response.ok) setError(data as ApiError);
      else setResults(data as Results);
    } catch {
      setError({ error: "Could not reach the server.", hint: "Is the dev server still running?" });
    } finally {
      setStage("idle");
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // ?lat=&lng= pins the sweep to a fixed area, so a territory can be bookmarked
    // or shared without relying on where the browser thinks you are.
    const params = new URLSearchParams(window.location.search);
    const pinnedLat = Number(params.get("lat"));
    const pinnedLng = Number(params.get("lng"));
    if (Number.isFinite(pinnedLat) && Number.isFinite(pinnedLng) && params.has("lat")) {
      setLabel(`within 10 miles of ${pinnedLat.toFixed(3)}, ${pinnedLng.toFixed(3)}`);
      void runSweep(pinnedLat, pinnedLng);
      return;
    }

    if (!navigator.geolocation) {
      setStage("idle");
      setError({
        error: "This browser cannot share your location.",
        hint: "Use the manual search below instead.",
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLabel(`within 10 miles of ${latitude.toFixed(3)}, ${longitude.toFixed(3)}`);
        void runSweep(latitude, longitude);
      },
      (geoError) => {
        setStage("idle");
        setError({
          error:
            geoError.code === geoError.PERMISSION_DENIED
              ? "Location permission denied."
              : "Could not work out where you are.",
          hint: "Type a location in the manual search below and it will work the same way.",
        });
      },
      { timeout: 10000, maximumAge: 5 * 60 * 1000 },
    );
  }, [runSweep]);

  async function runManualSearch(event: React.FormEvent) {
    event.preventDefault();
    setManualBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, location }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data as ApiError);
      } else {
        setResults(data as Results);
        setLabel(`${category} in ${location}`);
      }
    } catch {
      setError({ error: "Could not reach the server.", hint: "Is the dev server still running?" });
    } finally {
      setManualBusy(false);
    }
  }

  function downloadCsv() {
    if (!results) return;
    const blob = new Blob([leadsToCsv(results.leads)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = csvFilename(results.query ?? "near-me");
    link.click();
    URL.revokeObjectURL(url);
  }

  const busy = stage !== "idle";
  const scanned = results?.totalScanned ?? results?.totalFound ?? 0;
  const failedTrades = results?.byTrade?.filter((t) => t.error) ?? [];

  return (
    <main>
      <h1>Lead Finder</h1>
      <p className="sub">
        Businesses on Google Maps with no website, {label} — sorted by how much they stand to gain
        from one.
      </p>

      {busy && (
        <div className="empty">
          {stage === "locating"
            ? "Asking your browser where you are…"
            : "Scanning 10 local trades for businesses without websites…"}
        </div>
      )}

      {error && (
        <div className="error">
          <strong>{error.error}</strong>
          {error.hint && <span>{error.hint}</span>}
        </div>
      )}

      {results && results.leads.length > 0 && (
        <>
          <div className="summary">
            <p>
              <strong>{results.leads.length}</strong> without a website, out of {scanned} businesses
              scanned.{" "}
              {results.fromCache
                ? "Served from cache — no new API cost."
                : `${results.requestsUsed} API requests used.`}
            </p>
            <button type="button" className="secondary" onClick={downloadCsv}>
              Export CSV
            </button>
          </div>

          {failedTrades.length > 0 && (
            <p className="hint">
              {failedTrades.length} trade searches failed and were skipped:{" "}
              {failedTrades.map((t) => t.trade).join(", ")}.
            </p>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Score</th>
                  <th>Business</th>
                  <th>Phone</th>
                  <th>Reviews</th>
                  <th>Rating</th>
                  <th>Address</th>
                  <th>Maps</th>
                </tr>
              </thead>
              <tbody>
                {results.leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <span className={`badge ${scoreClass(lead.score)}`}>{lead.score}</span>
                    </td>
                    <td className="name">
                      {lead.name}
                      {lead.category && <div className="hint">{lead.category}</div>}
                    </td>
                    <td>{lead.phone ? <a href={`tel:${lead.phone}`}>{lead.phone}</a> : "—"}</td>
                    <td>{lead.reviewCount}</td>
                    <td>{lead.rating ?? "—"}</td>
                    <td className="address">{lead.address}</td>
                    <td>
                      {lead.mapsUrl ? (
                        <a href={lead.mapsUrl} target="_blank" rel="noreferrer noopener">
                          Open
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {results && results.leads.length === 0 && !busy && (
        <div className="empty">
          Scanned {scanned} businesses and every one of them already has a website. Try the manual
          search below with a different trade or a nearby town.
        </div>
      )}

      <details className="manual">
        <summary>Search somewhere else</summary>
        <form onSubmit={runManualSearch}>
          <div>
            <label htmlFor="category">Business type</label>
            <input
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="plumbers, barber shops, dentists…"
              required
            />
          </div>
          <div>
            <label htmlFor="location">Location</label>
            <input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Austin TX, Manchester UK…"
              required
            />
          </div>
          <button type="submit" disabled={manualBusy || busy}>
            {manualBusy ? "Searching…" : "Find leads"}
          </button>
        </form>
        <p className="hint">
          Google caps a single search at 60 businesses. Each manual search costs up to 3 billed
          Places requests.
        </p>
      </details>
    </main>
  );
}

