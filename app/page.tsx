"use client";

import { useState } from "react";
import { leadsToCsv, csvFilename } from "@/lib/csv";
import type { Lead } from "@/lib/types";

interface SearchResponse {
  leads: Lead[];
  totalFound: number;
  withWebsite: number;
  requestsUsed: number;
  fromCache: boolean;
  query: string;
}

interface ApiError {
  error: string;
  hint?: string;
}

function scoreClass(score: number): string {
  if (score >= 60) return "hot";
  if (score >= 30) return "warm";
  return "cool";
}

export default function Home() {
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

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
        setResult(data as SearchResponse);
      }
    } catch {
      setError({ error: "Could not reach the server.", hint: "Is the dev server still running?" });
    } finally {
      setLoading(false);
    }
  }

  function downloadCsv() {
    if (!result) return;
    const blob = new Blob([leadsToCsv(result.leads)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = csvFilename(result.query);
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main>
      <h1>Lead Finder</h1>
      <p className="sub">
        Local businesses on Google Maps with no website — sorted by how much they stand to gain from one.
      </p>

      <form onSubmit={runSearch}>
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
        <button type="submit" disabled={loading}>
          {loading ? "Searching…" : "Find leads"}
        </button>
      </form>

      <p className="hint">
        Google caps a single search at 60 businesses, so search one trade and one town at a time.
        Each search costs up to 3 billed Places requests.
      </p>

      {error && (
        <div className="error">
          <strong>{error.error}</strong>
          {error.hint && <span>{error.hint}</span>}
        </div>
      )}

      {result && result.leads.length > 0 && (
        <>
          <div className="summary">
            <p>
              <strong>{result.leads.length}</strong> without a website, out of {result.totalFound}{" "}
              businesses found ({result.withWebsite} already have one).{" "}
              {result.fromCache ? "Served from cache — no new API cost." : `${result.requestsUsed} API requests used.`}
            </p>
            <button type="button" className="secondary" onClick={downloadCsv}>
              Export CSV
            </button>
          </div>

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
                {result.leads.map((lead) => (
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

      {result && result.leads.length === 0 && (
        <div className="empty">
          {result.totalFound === 0 ? (
            <>Google returned no businesses for that search. Try a broader business type or a larger area.</>
          ) : (
            <>
              All {result.totalFound} businesses found already have a website. Try a different trade, a
              smaller town, or a less competitive category.
            </>
          )}
        </div>
      )}
    </main>
  );
}
