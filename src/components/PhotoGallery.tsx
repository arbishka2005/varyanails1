import { useEffect } from "react";
import { X } from "lucide-react";
import { resolveApiUrl } from "../api";
import { photoKindLabel } from "../lib/bookingPresentation";
import type { PhotoAttachment } from "../types";

export function PhotoGallery({
  photos,
  onOpen,
}: {
  photos: PhotoAttachment[];
  onOpen: (photo: PhotoAttachment) => void;
}) {
  return (
    <div className="photo-gallery" role="list">
      {photos.map((photo) => {
        const previewSrc = resolveApiUrl(photo.previewUrl);

        return (
          <button key={photo.id} className="photo-thumb" onClick={() => onOpen(photo)} type="button">
            <span className="photo-thumb-media">
              {previewSrc ? (
                <img src={previewSrc} alt={photo.fileName} loading="lazy" />
              ) : (
                <span className="photo-thumb-fallback">{photoKindLabel(photo.kind)}</span>
              )}
            </span>
            <span className="photo-thumb-meta">
              <strong>{photoKindLabel(photo.kind)}</strong>
              <small>{photo.fileName}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function PhotoLightbox({
  photo,
  onClose,
}: {
  photo: PhotoAttachment | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!photo) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, photo]);

  if (!photo) {
    return null;
  }

  const previewSrc = resolveApiUrl(photo.previewUrl);

  return (
    <div className="photo-lightbox" onClick={onClose} role="presentation">
      <div
        className="photo-lightbox-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label={photo.fileName}
        aria-modal="true"
      >
        <button className="photo-lightbox-close" onClick={onClose} type="button" aria-label="Закрыть фото">
          <X size={18} />
        </button>
        <div className="photo-lightbox-media">
          {previewSrc ? (
            <img src={previewSrc} alt={photo.fileName} />
          ) : (
            <div className="photo-lightbox-fallback">{photoKindLabel(photo.kind)}</div>
          )}
        </div>
        <div className="photo-lightbox-meta">
          <span className="status">{photoKindLabel(photo.kind)}</span>
          <strong>{photo.fileName}</strong>
        </div>
      </div>
    </div>
  );
}
