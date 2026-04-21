import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { HideTab } from "@/components/HideTab";
import { ExtractTab } from "@/components/ExtractTab";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "stegcrypt :: client-side image steganography" },
      {
        name: "description",
        content:
          "Hide AES-GCM encrypted messages inside PNG images using LSB steganography. 100% in-browser.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [tab, setTab] = useState<"hide" | "extract">("hide");

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 md:py-16">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          ~/stegcrypt — v1.0
        </p>
        <h1 className="mt-2 text-4xl font-bold glow-text md:text-5xl">
          <span className="text-primary">$</span> hide.message
          <span className="blink-caret"></span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          AES-GCM + PBKDF2 encryption embedded into PNG pixels via LSB steganography. Runs entirely
          in your browser — no servers, no uploads, no logs.
        </p>
      </header>

      <div className="mb-6 inline-flex rounded-md border border-border bg-card/60 p-1">
        <TabBtn active={tab === "hide"} onClick={() => setTab("hide")}>
          ▸ hide message
        </TabBtn>
        <TabBtn active={tab === "extract"} onClick={() => setTab("extract")}>
          ▸ extract message
        </TabBtn>
      </div>

      <section className="terminal-card glow-border rounded-lg p-5 md:p-8">
        {tab === "hide" ? <HideTab /> : <ExtractTab />}
      </section>

      <footer className="mt-10 text-center text-xs text-muted-foreground/70">
        AES-256-GCM · PBKDF2-SHA256 (250k iter) · LSB(R,G,B) · PNG lossless
      </footer>
    </main>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-4 py-2 text-xs font-bold uppercase tracking-widest transition ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
