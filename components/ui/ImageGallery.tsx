"use client";

import { useState } from "react";
import ImageZoom from "./ImageZoom";

interface ImageGalleryProps {
  images: string[];        // all image URLs
  alt: string;
  mainClassName?: string;  // class for the main image container
}

/**
 * Main image with ImageZoom + thumbnail strip below.
 * Clicking a thumbnail swaps the main image.
 */
export default function ImageGallery({ images, alt, mainClassName = "w-full h-full object-contain p-4" }: ImageGalleryProps) {
  const unique = [...new Set(images.filter(Boolean))];
  const [active, setActive] = useState(0);

  if (unique.length === 0) return null;
  if (unique.length === 1) {
    return <ImageZoom src={unique[0]} alt={alt} imgClassName={mainClassName} />;
  }

  return (
    <div className="flex flex-col w-full h-full">
      {/* Main image */}
      <div className="flex-1 min-h-0">
        <ImageZoom src={unique[active]} alt={alt} imgClassName={mainClassName} />
      </div>

      {/* Thumbnail strip */}
      <div className="flex gap-1 px-2 pb-2 pt-1 overflow-x-auto justify-center">
        {unique.map((src, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`flex-shrink-0 w-9 h-9 rounded border overflow-hidden transition-all ${
              i === active ? "border-blue-400 ring-1 ring-blue-400" : "border-gray-200 opacity-60 hover:opacity-100"
            }`}
          >
            <img src={src} alt={`${alt} ${i + 1}`} className="w-full h-full object-contain" loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}
