import { useCallback, useRef, useState } from "react";

interface Props {
  onFile: (file: File) => void;
  accept?: string;
  hint?: string;
}

export function DropZone({
  onFile,
  accept = "image/png,image/jpeg,image/webp",
  hint = "PNG, JPEG, or WEBP",
}: Props) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];
      const allowed = accept.split(",").map((s) => s.trim());
      if (allowed.length && !allowed.some((a) => file.type === a || file.type.match(a.replace("*", ".*")))) {
        alert("Invalid file type. " + hint);
        return;
      }
      onFile(file);
    },
    [accept, hint, onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-md border border-dashed p-8 text-center transition-colors ${
        over ? "border-primary bg-accent/40 glow-border" : "border-border hover:border-primary/60"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="text-sm text-muted-foreground">
        <span className="text-primary">$</span> drop image here{" "}
        <span className="opacity-60">or click to browse</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground/70">{hint}</p>
    </div>
  );
}
