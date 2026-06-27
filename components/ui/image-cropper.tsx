"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

const VIEWPORT = 280; // px — the round crop window
const OUTPUT = 512; // px — saved square image

/**
 * Square photo cropper. Drag to reposition, slider to zoom, then "Set" renders
 * the visible circle's bounding square to a 512px JPEG and hands back the Blob.
 */
export function ImageCropper({
  file,
  onCancel,
  onConfirm,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const [url, setUrl] = useState("");
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [minScale, setMinScale] = useState(1);
  const [scale, setScale] = useState(1); // displayed px per source px
  const [pos, setPos] = useState({ x: 0, y: 0 }); // image top-left in viewport coords
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  function clampPos(p: { x: number; y: number }, s: number) {
    const dw = (nat?.w ?? 0) * s;
    const dh = (nat?.h ?? 0) * s;
    return {
      x: Math.min(0, Math.max(VIEWPORT - dw, p.x)),
      y: Math.min(0, Math.max(VIEWPORT - dh, p.y)),
    };
  }

  function onImgLoad() {
    const img = imgRef.current;
    if (!img) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const cover = Math.max(VIEWPORT / w, VIEWPORT / h); // smallest scale that covers the window
    setNat({ w, h });
    setMinScale(cover);
    setScale(cover);
    setPos({ x: (VIEWPORT - w * cover) / 2, y: (VIEWPORT - h * cover) / 2 });
  }

  function onPointerDown(e: ReactPointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  }
  function onPointerMove(e: ReactPointerEvent) {
    if (!drag.current) return;
    const nx = drag.current.px + (e.clientX - drag.current.x);
    const ny = drag.current.py + (e.clientY - drag.current.y);
    setPos(clampPos({ x: nx, y: ny }, scale));
  }
  function onPointerUp(e: ReactPointerEvent) {
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onZoom(next: number) {
    if (!nat) return;
    // Keep the window's center anchored to the same point of the source image.
    const cx = (VIEWPORT / 2 - pos.x) / scale;
    const cy = (VIEWPORT / 2 - pos.y) / scale;
    setScale(next);
    setPos(clampPos({ x: VIEWPORT / 2 - cx * next, y: VIEWPORT / 2 - cy * next }, next));
  }

  function onSet() {
    const img = imgRef.current;
    if (!img || !nat) return;
    setSaving(true);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setSaving(false);
      return;
    }
    const sSize = VIEWPORT / scale; // source pixels shown across the window
    ctx.drawImage(img, -pos.x / scale, -pos.y / scale, sSize, sSize, 0, 0, OUTPUT, OUTPUT);
    canvas.toBlob(
      (blob) => {
        setSaving(false);
        if (blob) onConfirm(blob);
      },
      "image/jpeg",
      0.9,
    );
  }

  const dw = (nat?.w ?? 0) * scale;
  const dh = (nat?.h ?? 0) * scale;

  return (
    <Modal onClose={onCancel} title="Crop your photo">
      <div className="space-y-4">
        <div
          className="relative mx-auto overflow-hidden rounded-xl bg-canvas ring-1 ring-line-strong"
          style={{ width: VIEWPORT, height: VIEWPORT, touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={url}
              alt=""
              draggable={false}
              onLoad={onImgLoad}
              className="absolute max-w-none cursor-grab select-none active:cursor-grabbing"
              style={{ left: pos.x, top: pos.y, width: dw, height: dh }}
            />
          )}

          {/* Crop guides — visual only, never intercept the drag. */}
          <div className="pointer-events-none absolute inset-0">
            {/* Avatar circle: outlines the round area and dims the square's corners. */}
            <div
              className="absolute inset-0 rounded-full ring-1 ring-white/80"
              style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }}
            />
            {/* Rule-of-thirds grid for composition. */}
            <div className="absolute left-1/3 top-0 h-full w-px bg-white/30" />
            <div className="absolute left-2/3 top-0 h-full w-px bg-white/30" />
            <div className="absolute left-0 top-1/3 h-px w-full bg-white/30" />
            <div className="absolute left-0 top-2/3 h-px w-full bg-white/30" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-faint">Zoom</span>
          <input
            type="range"
            min={minScale}
            max={minScale * 4}
            step={0.001}
            value={scale}
            onChange={(e) => onZoom(parseFloat(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer accent-brand-600"
            aria-label="Zoom"
          />
        </div>
        <p className="text-center text-xs text-faint">
          Drag to reposition · slider to zoom · the circle is your avatar · saved square, under 2 MB
        </p>

        <div className="flex justify-end gap-3 border-t border-line pt-4">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onSet} disabled={saving || !nat}>
            {saving ? "Saving…" : "Set photo"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
