"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "@/components/toaster";

async function resize(file: File, max: number, quality = 0.82): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/webp", quality));
  return { blob, width, height };
}

/** Multi-image uploader: resizes on the phone before upload to save data. */
export function ImageUploader({ name, initial, max = 6 }: { name: string; initial: string[]; max?: number }) {
  const [urls, setUrls] = useState<string[]>(initial);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files).slice(0, max - urls.length)) {
        const full = await resize(file, 1600);
        const small = await resize(file, 480, 0.75);
        const fd = new FormData();
        fd.append("file", new File([full.blob], file.name.replace(/\.\w+$/, "") + ".webp", { type: "image/webp" }));
        fd.append("thumb", new File([small.blob], "thumb.webp", { type: "image/webp" }));
        fd.append("width", String(full.width));
        fd.append("height", String(full.height));
        const res = await fetch("/api/admin/media", { method: "POST", body: fd });
        const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!res.ok || !json.url) throw new Error(json.error ?? "Upload failed");
        setUrls((u) => [...u, json.url!]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(urls)} />
      <div className="flex flex-wrap gap-3">
        {urls.map((u, i) => (
          <div key={u} className="group relative h-24 w-24 overflow-hidden rounded-xl border border-border">
            <img src={u.startsWith("/media/") ? `${u}?thumb=1` : u} alt="" className="h-full w-full object-cover" />
            {i === 0 && <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[10px] font-semibold text-white">Main</span>}
            <button type="button" onClick={() => setUrls((x) => x.filter((y) => y !== u))} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white opacity-90" aria-label="Remove image">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {urls.length < max && (
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="grid h-24 w-24 place-items-center rounded-xl border-2 border-dashed border-border-strong text-muted hover:border-primary hover:text-primary">
            {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <span className="flex flex-col items-center gap-1 text-xs font-medium"><ImagePlus className="h-6 w-6" /> Add photo</span>}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      <p className="mt-2 text-xs text-muted">Photos are resized on your phone before upload. The first photo is shown in the shop.</p>
    </div>
  );
}
