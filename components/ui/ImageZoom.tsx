"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

interface ImageZoomProps {
  src: string;
  alt: string;
  zoomSrc?: string;    // high-res source for zoom panel; falls back to src
  imgClassName?: string;
  zoomSize?: number;   // zoom panel px (default 380)
  zoomScale?: number;  // magnification (default 2.5)
  onClick?: () => void;
}

export default function ImageZoom({
  src, alt, zoomSrc, imgClassName = "", zoomSize = 380, zoomScale = 2.5, onClick,
}: ImageZoomProps) {
  const [active, setActive] = useState(false);
  const [bgPos, setBgPos] = useState("50% 50%");
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const imgRef = useRef<HTMLImageElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const handleMove = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();

    // Background position within zoomed image
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const py = ((e.clientY - rect.top) / rect.height) * 100;
    setBgPos(`${px}% ${py}%`);

    // Panel position: right of card, vertically centered on card
    let left = rect.right + 12;
    if (left + zoomSize > window.innerWidth - 8) {
      left = rect.left - zoomSize - 12; // flip left
    }
    let top = rect.top + rect.height / 2 - zoomSize / 2;
    top = Math.max(8, Math.min(window.innerHeight - zoomSize - 8, top));

    setPanelStyle({ top, left, width: zoomSize, height: zoomSize });
  }, [zoomSize]);

  const zoomPanel = active && mounted ? createPortal(
    <div
      className="fixed z-[9999] rounded-xl border border-gray-200 shadow-2xl pointer-events-none"
      style={{
        ...panelStyle,
        backgroundImage: `url(${zoomSrc || src})`,
        backgroundSize: `${zoomScale * 100}%`,
        backgroundPosition: bgPos,
        backgroundRepeat: "no-repeat",
        backgroundColor: "#fff",
      }}
    />,
    document.body
  ) : null;

  return (
    <>
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className={`${imgClassName} cursor-zoom-in`}
        loading="lazy"
        onMouseEnter={() => setActive(true)}
        onMouseLeave={() => setActive(false)}
        onMouseMove={handleMove}
        onClick={onClick}
        draggable={false}
      />
      {zoomPanel}
    </>
  );
}
