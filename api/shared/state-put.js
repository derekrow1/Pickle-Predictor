import { put } from "@vercel/blob";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
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

    const adminToken = process.env.SHARED_STATE_ADMIN_TOKEN;
    if (adminToken) {
      const provided = req.headers["x-shared-state-admin-token"];
      if (provided !== adminToken) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }

    const bodyText =
      typeof req.body === "string"
        ? req.body
        : req.body
        ? JSON.stringify(req.body)
        : "";
    if (!bodyText) {
      res.status(400).json({ error: "Missing request body" });
      return;
    }

    // Validate JSON
    let parsed;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      res.status(400).json({ error: "Body must be valid JSON" });
      return;
    }

    const now = new Date();
    const iso = now.toISOString().replace(/[:.]/g, "-");
    const pathname = `shared/state/${iso}.json`;

    const blob = await put(pathname, JSON.stringify(parsed, null, 0), {
      access: "private",
      contentType: "application/json",
      token,
      addRandomSuffix: false,
    });

    res.status(200).json({ ok: true, url: blob.url, pathname: blob.pathname, uploadedAt: now.toISOString() });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}

