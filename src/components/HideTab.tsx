import { useMemo, useState } from "react";
import { DropZone } from "./DropZone";
import {
  buildPayload,
  canvasToPngBlob,
  capacityBytes,
  embedIntoImageData,
  encryptMessage,
  imageToCanvas,
  loadImageFile,
} from "@/lib/stego";

type Status = { kind: "idle" | "ok" | "err" | "busy"; msg?: string };

export function HideTab() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [message, setMessage] = useState("");
  const [pass, setPass] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [outUrl, setOutUrl] = useState<string | null>(null);

  const capacity = dims ? capacityBytes(dims.w, dims.h) - 36 : 0;
  const usage = useMemo(() => new Blob([message]).size, [message]);

  const [converted, setConverted] = useState(false);

  async function pickFile(f: File) {
    const supported = ["image/png", "image/jpeg", "image/webp"];
    if (!supported.includes(f.type)) {
      setStatus({ kind: "err", msg: "Only PNG, JPEG, or WEBP images are accepted." });
      return;
    }
    setFile(f);
    setOutUrl(null);
    setConverted(f.type !== "image/png");
    setStatus(
      f.type !== "image/png"
        ? { kind: "ok", msg: "Image will be converted to PNG to preserve hidden data." }
        : { kind: "idle" },
    );
    const img = await loadImageFile(f);
    setDims({ w: img.naturalWidth, h: img.naturalHeight });
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
  }

  async function onEmbed() {
    if (!file) return setStatus({ kind: "err", msg: "Select a PNG image first." });
    if (!message) return setStatus({ kind: "err", msg: "Enter a message to hide." });
    if (!pass) return setStatus({ kind: "err", msg: "Enter a passphrase." });
    setStatus({ kind: "busy", msg: "Encrypting & embedding..." });
    try {
      const img = await loadImageFile(file);
      const canvas = imageToCanvas(img);
      const ctx = canvas.getContext("2d")!;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const { salt, iv, ciphertext } = await encryptMessage(message, pass);
      const payload = buildPayload(salt, iv, ciphertext);
      embedIntoImageData(imageData, payload);
      ctx.putImageData(imageData, 0, 0);

      const blob = await canvasToPngBlob(canvas);
      if (outUrl) URL.revokeObjectURL(outUrl);
      setOutUrl(URL.createObjectURL(blob));
      setStatus({ kind: "ok", msg: `Embedded ${payload.length} bytes successfully.` });
    } catch (e) {
      setStatus({ kind: "err", msg: e instanceof Error ? e.message : "Embed failed." });
    }
  }

  const overflow = dims && usage > capacity;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <DropZone onFile={pickFile} />
        {previewUrl && (
          <div className="terminal-card overflow-hidden rounded-md">
            <img src={previewUrl} alt="preview" className="max-h-64 w-full object-contain" />
            <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
              {dims && `${dims.w}×${dims.h} px`} · capacity ≈ {capacity.toLocaleString()} B ·
              message {usage} B {overflow && <span className="text-destructive">(too large!)</span>}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
            &gt; secret message
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            className="w-full resize-none rounded-md border border-border bg-input p-3 text-sm text-foreground outline-none focus:border-primary focus:glow-border"
            placeholder="type the payload..."
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
            &gt; passphrase
          </label>
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="w-full rounded-md border border-border bg-input p-3 text-sm outline-none focus:border-primary focus:glow-border"
            placeholder="••••••••"
          />
        </div>

        <button
          onClick={onEmbed}
          disabled={status.kind === "busy"}
          className="w-full rounded-md bg-primary px-4 py-3 text-sm font-bold uppercase tracking-widest text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {status.kind === "busy" ? "Working..." : "Encrypt & Embed"}
        </button>

        <StatusLine status={status} />

        {outUrl && (
          <a
            href={outUrl}
            download="stego.png"
            className="block rounded-md border border-primary px-4 py-3 text-center text-sm font-bold uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground"
          >
            ⬇ Download stego-image
          </a>
        )}
      </div>
    </div>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (status.kind === "idle") return null;
  const color =
    status.kind === "ok"
      ? "text-success"
      : status.kind === "err"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <p className={`text-xs ${color}`}>
      <span className="text-primary">$</span> {status.msg}
    </p>
  );
}
