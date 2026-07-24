"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DetectionResult, PreviewArticle, Selectors } from "@/lib/sources/detect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Profile = { id: string; name: string };

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof data?.error === "string" ? data.error : "Something went wrong. Try again.";
    throw new Error(message);
  }
  return data as T;
}

export function AddSourceForm({ profiles }: { profiles: Profile[] }) {
  const router = useRouter();

  const [url, setUrl] = useState("");
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [name, setName] = useState("");
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [selectors, setSelectors] = useState<Selectors>({
    articleSelector: "",
    titleSelector: "",
    linkSelector: "",
  });
  const [preview, setPreview] = useState<PreviewArticle[]>([]);
  const [busy, setBusy] = useState<"detect" | "preview" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDetect() {
    setError(null);
    setBusy("detect");
    try {
      const result = await postJson<DetectionResult>("/api/sources/detect", { url });
      setDetection(result);
      setPreview(result.preview);
      if (!name && result.suggestedName) setName(result.suggestedName);
      if (result.type === "html" && result.selectors) setSelectors(result.selectors);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch that URL.");
      setDetection(null);
    } finally {
      setBusy(null);
    }
  }

  async function handleRepreview() {
    setError(null);
    setBusy("preview");
    try {
      const result = await postJson<DetectionResult>("/api/sources/detect", { url, selectors });
      setPreview(result.preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not preview those selectors.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSave() {
    if (!detection) return;
    setError(null);
    setBusy("save");
    try {
      await postJson("/api/sources", {
        profileId,
        name: name || url,
        url,
        type: detection.type === "rss" ? "RSS" : "HTML",
        feedUrl: detection.type === "rss" ? detection.feedUrl : undefined,
        selectors: detection.type === "html" ? selectors : undefined,
      });
      router.push("/sources");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that source.");
      setBusy(null);
    }
  }

  function reset() {
    setDetection(null);
    setPreview([]);
    setError(null);
  }

  const selectorsUsable =
    selectors.articleSelector.trim() && selectors.titleSelector.trim() && selectors.linkSelector.trim();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="profile">Profile</Label>
        <Select value={profileId} onValueChange={(value) => setProfileId(value ?? "")}>
          <SelectTrigger id="profile" className="w-full">
            <SelectValue placeholder="Choose a profile" />
          </SelectTrigger>
          <SelectContent>
            {profiles.map((profile) => (
              <SelectItem key={profile.id} value={profile.id}>
                {profile.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="url">Source URL</Label>
        <div className="flex gap-2">
          <Input
            id="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              reset();
            }}
            placeholder="example.com"
            disabled={busy !== null}
          />
          <Button type="button" onClick={handleDetect} disabled={!url || busy !== null}>
            {busy === "detect" ? "Detecting…" : "Detect"}
          </Button>
        </div>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {detection && (
        <div className="flex flex-col gap-4 rounded-lg border p-4">
          <p className="text-sm">
            {detection.type === "rss" ? (
              <>
                Found an RSS feed: <span className="font-mono text-xs">{detection.feedUrl}</span>
              </>
            ) : (
              "No RSS feed found — proposing CSS selectors to scrape the page instead."
            )}
          </p>

          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          {detection.type === "html" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="articleSelector">Article selector</Label>
                <Input
                  id="articleSelector"
                  value={selectors.articleSelector}
                  onChange={(e) => setSelectors({ ...selectors, articleSelector: e.target.value })}
                  placeholder="div.article-card"
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="titleSelector">Title selector (relative)</Label>
                <Input
                  id="titleSelector"
                  value={selectors.titleSelector}
                  onChange={(e) => setSelectors({ ...selectors, titleSelector: e.target.value })}
                  placeholder="h2 a"
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="linkSelector">Link selector (relative)</Label>
                <Input
                  id="linkSelector"
                  value={selectors.linkSelector}
                  onChange={(e) => setSelectors({ ...selectors, linkSelector: e.target.value })}
                  placeholder="h2 a"
                  className="font-mono text-xs"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-fit"
                onClick={handleRepreview}
                disabled={!selectorsUsable || busy !== null}
              >
                {busy === "preview" ? "Previewing…" : "Preview these selectors"}
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Preview ({preview.length} article{preview.length === 1 ? "" : "s"})</p>
            {preview.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No articles matched. Adjust the selectors above and preview again.
              </p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {preview.map((article) => (
                  <li key={article.link} className="truncate">
                    <a
                      href={article.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {article.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button
            type="button"
            onClick={handleSave}
            disabled={!name || !profileId || preview.length === 0 || busy !== null}
            className="w-fit"
          >
            {busy === "save" ? "Saving…" : "Save source"}
          </Button>
        </div>
      )}
    </div>
  );
}
