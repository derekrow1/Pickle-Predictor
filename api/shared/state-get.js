import { list, get } from "@vercel/blob";

const STATE_PREFIX = "shared/state";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      res.status(501).json({
        error: "Blob storage not configured",
        hint: "Set BLOB_READ_WRITE_TOKEN in Vercel env vars.",
      });
      return;
    }

    // Find the latest state blob (lexicographically newest key).
    const { blobs } = await list({ prefix: STATE_PREFIX, token, limit: 10, access: "private" });
    if (!blobs || blobs.length === 0) {
      res.status(404).json({ error: "No shared state found" });
      return;
    }
    const latest = blobs
      .slice()
      .sort((a, b) => String(b.pathname || "").localeCompare(String(a.pathname || "")))[0];

    const result = await get(latest.pathname, { token, access: "private" });
    if (!result || result.statusCode !== 200) {
      res.status(404).json({ error: "Shared state blob not found" });
      return;
    }
    const text = await new Response(result.stream).text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      res.status(500).json({ error: "Stored shared state is not valid JSON" });
      return;
    }

    res.status(200).json({
      ok: true,
      updatedAt: result.blob?.uploadedAt,
      pathname: result.blob?.pathname,
      state: json,
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}

