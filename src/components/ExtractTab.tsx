import { useState } from "react";
import { DropZone } from "./DropZone";
import { decryptMessage, extractFromImageData, imageToCanvas, loadImageFile } from "@/lib/stego";

type Status = { kind: "idle" | "ok" | "err" | "busy"; msg?: string };

export function ExtractTab() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pass, setPass] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [output, setOutput] = useState<string>("");
  const [copied, setCopied] = useState(false);

  async function pickFile(f: File) {
    const supported = ["image/png", "image/jpeg", "image/webp"];
    if (!supported.includes(f.type)) {
      setStatus({ kind: "err", msg: "Only PNG, JPEG, or WEBP images are accepted." });
      return;
    }
    setFile(f);
    setOutput("");
    setStatus({ kind: "idle" });
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
  }

  async function onExtract() {
    if (!file) return setStatus({ kind: "err", msg: "Select a stego-image first." });
    if (!pass) return setStatus({ kind: "err", msg: "Enter the passphrase." });
    setStatus({ kind: "busy", msg: "Extracting & decrypting..." });
    setOutput("");
    try {
      const img = await loadImageFile(file);
      const canvas = imageToCanvas(img);
      const ctx = canvas.getContext("2d")!;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { salt, iv, ciphertext } = extractFromImageData(imageData);
      try {
        const text = await decryptMessage(ciphertext, pass, salt, iv);
        setOutput(text);
        setStatus({ kind: "ok", msg: "Decryption successful." });
      } catch {
        setStatus({ kind: "err", msg: "Invalid passphrase or no hidden data found" });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Extraction failed.";
      setStatus({
        kind: "err",
        msg: msg.includes("hidden") ? "Invalid passphrase or no hidden data found" : msg,
      });
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <DropZone onFile={pickFile} hint="Stego-PNG produced by this tool" />
        {previewUrl && (
          <div className="terminal-card overflow-hidden rounded-md">
            <img src={previewUrl} alt="preview" className="max-h-64 w-full object-contain" />
          </div>
        )}
      </div>

      <div className="space-y-4">
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
          onClick={onExtract}
          disabled={status.kind === "busy"}
          className="w-full rounded-md bg-primary px-4 py-3 text-sm font-bold uppercase tracking-widest text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {status.kind === "busy" ? "Working..." : "Extract & Decrypt"}
        </button>

        {status.kind !== "idle" && (
          <p
            className={`text-xs ${
              status.kind === "ok"
                ? "text-success"
                : status.kind === "err"
                  ? "text-destructive"
                  : "text-muted-foreground"
            }`}
          >
            <span className="text-primary">$</span> {status.msg}
          </p>
        )}

        {output && (
          <div className="terminal-card rounded-md p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                decoded payload
              </span>
              <button
                onClick={copy}
                className="rounded border border-border px-2 py-1 text-xs hover:border-primary hover:text-primary"
              >
                {copied ? "✓ copied" : "copy"}
              </button>
            </div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm text-foreground">
              {output}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
