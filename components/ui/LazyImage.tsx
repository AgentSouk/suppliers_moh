"use client";
import { useEffect, useRef, useState } from "react";

interface LazyImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  imgClassName?: string;
}

export default function LazyImage({ src, alt, className = "", imgClassName = "" }: LazyImageProps) {
  const [inView, setInView] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect(); } },
      { rootMargin: "300px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className={`relative overflow-hidden ${className}`}>
      {/* Skeleton shown until image loads */}
      {(!loaded || !inView) && (
        <div className="absolute inset-0 bg-gray-100 animate-pulse" />
      )}
      {inView && src ? (
        <img
          src={src}
          alt={alt}
          onLoad={() => setLoaded(true)}
          className={`w-full h-full transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"} ${imgClassName}`}
        />
      ) : inView && !src ? (
        <div className="absolute inset-0 flex items-center justify-center opacity-20">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" width="36" height="36">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
          </svg>
        </div>
      ) : null}
    </div>
  );
}
