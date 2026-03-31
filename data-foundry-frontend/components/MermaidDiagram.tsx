"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

declare global {
  interface Window {
    mermaid: any;
  }
}

interface MermaidDiagramProps {
  chart: string;
}

export default function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if mermaid is already loaded
    if (window.mermaid) {
      setIsLoaded(true);
      return;
    }

    // Load mermaid from CDN
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/mermaid@10.9.0/dist/mermaid.min.js";
    script.async = true;
    script.onload = () => {
      window.mermaid.initialize({ startOnLoad: false, theme: 'default' });
      setIsLoaded(true);
    };
    script.onerror = () => {
      setError("Failed to load mermaid.js");
    };
    document.body.appendChild(script);

    return () => {
      // Cleanup if needed (rare for CDN scripts)
    };
  }, []);

  useEffect(() => {
    if (isLoaded && containerRef.current && window.mermaid) {
      setError(null);
      const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
      
      try {
        window.mermaid.render(id, chart).then((result: any) => {
           if (containerRef.current) {
             containerRef.current.innerHTML = result.svg;
           }
        }).catch((e: any) => {
           console.error("Mermaid render error:", e);
           // Fallback or retry logic if needed, usually parse error
           // Mermaid usually replaces the element content on error with error text
        });
      } catch (err) {
        console.error("Mermaid execution error:", err);
      }
    }
  }, [isLoaded, chart]);

  if (error) {
    return <div className="p-4 border border-red-200 text-red-500 rounded text-sm bg-red-50">Cannot load diagram visualization.</div>;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[100px] bg-white p-4 rounded-lg border shadow-sm w-full overflow-auto">
       {!isLoaded && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
       <div ref={containerRef} className="w-full flex justify-center" />
    </div>
  );
}
