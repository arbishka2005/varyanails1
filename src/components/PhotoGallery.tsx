import { useEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { resolveApiUrl } from "../api";
import { photoKindLabel } from "../lib/bookingPresentation";
import type { PhotoAttachment } from "../types";

export function PhotoGallery({
  photos,
  onOpen,
  onRemove,
}: {
  photos: PhotoAttachment[];
  onOpen: (photo: PhotoAttachment) => void;
  onRemove?: (photoId: string) => void;
}) {
  if (photos.length === 0) {
    return <div className="photo-gallery-empty">Фото пока нет</div>;
  }

  return (
    <div className="photo-gallery" role="list">
      {photos.map((photo) => {
        const previewSrc = resolveApiUrl(photo.previewUrl);

        return (
          <div className="photo-thumb-shell" key={photo.id} role="listitem">
            <button className="photo-thumb" onClick={() => onOpen(photo)} type="button">
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
            {onRemove ? (
              <button
                aria-label={`Удалить ${photo.fileName}`}
                className="photo-thumb-remove"
                onClick={() => onRemove(photo.id)}
                type="button"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function PhotoLightbox({
  photo,
  photos,
  onSelect,
  onClose,
}: {
  photo: PhotoAttachment | null;
  photos?: PhotoAttachment[];
  onSelect?: (photo: PhotoAttachment) => void;
  onClose: () => void;
}) {
  const touchStartXRef = useRef<number | null>(null);
  const gallery = useMemo(
    () => (photos?.length ? photos : photo ? [photo] : []),
    [photo, photos],
  );
  const activeIndex = photo ? Math.max(0, gallery.findIndex((item) => item.id === photo.id)) : -1;
  const activePhoto = activeIndex >= 0 ? gallery[activeIndex] : photo;

  const openPhoto = (nextIndex: number) => {
    const nextPhoto = gallery[nextIndex];
    if (!nextPhoto) {
      return;
    }

    onSelect?.(nextPhoto);
  };

  const showPrevious = () => {
    if (gallery.length < 2 || activeIndex < 0) {
      return;
    }

    openPhoto((activeIndex - 1 + gallery.length) % gallery.length);
  };

  const showNext = () => {
    if (gallery.length < 2 || activeIndex < 0) {
      return;
    }

    openPhoto((activeIndex + 1) % gallery.length);
  };

  useEffect(() => {
    if (!photo) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }

      if (event.key === "ArrowLeft") {
        showPrevious();
      }

      if (event.key === "ArrowRight") {
        showNext();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, gallery.length, onClose, photo]);

  if (!activePhoto) {
    return null;
  }

  const previewSrc = resolveApiUrl(activePhoto.previewUrl);
  const hasNavigation = gallery.length > 1 && activeIndex >= 0;

  return (
    <div className="photo-lightbox" onClick={onClose} role="presentation">
      <div
        className="photo-lightbox-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label={activePhoto.fileName}
        aria-modal="true"
        onTouchStart={(event) => {
          touchStartXRef.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          if (touchStartXRef.current === null) {
            return;
          }

          const deltaX = event.changedTouches[0]?.clientX - touchStartXRef.current;
          touchStartXRef.current = null;

          if (Math.abs(deltaX) < 42) {
            return;
          }

          if (deltaX > 0) {
            showPrevious();
          } else {
            showNext();
          }
        }}
      >
        <button className="photo-lightbox-close" onClick={onClose} type="button" aria-label="Закрыть фото">
          <X size={18} />
        </button>
        {hasNavigation ? (
          <>
            <button className="photo-lightbox-nav previous" onClick={showPrevious} type="button" aria-label="Предыдущее фото">
              <ChevronLeft size={20} />
            </button>
            <button className="photo-lightbox-nav next" onClick={showNext} type="button" aria-label="Следующее фото">
              <ChevronRight size={20} />
            </button>
          </>
        ) : null}
        <div className="photo-lightbox-media">
          {previewSrc ? (
            <img src={previewSrc} alt={activePhoto.fileName} />
          ) : (
            <div className="photo-lightbox-fallback">{photoKindLabel(activePhoto.kind)}</div>
          )}
        </div>
        <div className="photo-lightbox-meta">
          <span className="status">{photoKindLabel(activePhoto.kind)}</span>
          <strong>{activePhoto.fileName}</strong>
          {hasNavigation ? <small>{activeIndex + 1} из {gallery.length}</small> : null}
        </div>
      </div>
    </div>
  );
}
