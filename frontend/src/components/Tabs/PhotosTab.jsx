import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../Icon';
import TabHeader from '../TabHeader';
import EmptyState from '../EmptyState';
import ConfirmDialog from '../ConfirmDialog';
import { formatBytes, formatDate } from '../../utils/formatters';
import { interpolate } from '../../utils/i18n';
import { downloadItem, listPhotos, setItemSaved, trashItem } from '../../utils/api';
import { driveErrorMessage } from '../../utils/driveErrors';

// Every image in the drive (any folder). Photos are uploaded as files in "Files".
export default function PhotosTab({ t, lang, searchQuery, onClearSearch, notify, driveVersion, onDriveChanged }) {
  const [photos, setPhotos] = useState(null);
  const [viewerId, setViewerId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const query = searchQuery.trim().toLowerCase();
  const visiblePhotos = useMemo(
    () => (query ? (photos || []).filter((photo) => photo.title.toLowerCase().includes(query)) : photos || []),
    [photos, query],
  );

  useEffect(() => {
    let cancelled = false;
    listPhotos()
      .then((list) => !cancelled && setPhotos(list))
      .catch((error) => !cancelled && notify(driveErrorMessage(t, error), 'error'));
    return () => {
      cancelled = true;
    };
  }, [driveVersion, notify, t]);
  const viewerIndex = visiblePhotos.findIndex((photo) => photo.id === viewerId);
  const viewerPhoto = viewerIndex >= 0 ? visiblePhotos[viewerIndex] : null;

  useEffect(() => {
    if (!viewerPhoto) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event) => {
      if (event.key === 'Escape') setViewerId(null);
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
    };
  }, [viewerPhoto]);

  const replacePhoto = (next) =>
    setPhotos((current) => current.map((photo) => (photo.id === next.id ? next : photo)));

  const handleToggleSave = async (photo) => {
    replacePhoto({ ...photo, isSaved: !photo.isSaved });
    try {
      await setItemSaved(photo.id, !photo.isSaved);
      notify(photo.isSaved ? t.files.unsavedToast : t.files.savedToast, photo.isSaved ? 'info' : 'success');
      onDriveChanged();
    } catch (error) {
      replacePhoto(photo);
      notify(driveErrorMessage(t, error), 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await trashItem(target.id);
      if (viewerId === target.id) setViewerId(null);
      setPhotos((current) => current.filter((photo) => photo.id !== target.id));
      notify(t.drive.trashed, 'success');
      onDriveChanged();
    } catch (error) {
      notify(driveErrorMessage(t, error), 'error');
    }
  };

  const downloadPhoto = (photo) => {
    downloadItem(photo);
  };

  return (
    <section className="glass-panel tab-panel">
      <TabHeader
        icon="image"
        title={t.photos.title}
        subtitle={t.photos.subtitle}
        meta={interpolate(t.photos.count, { count: photos?.length || 0 })}
      />

      {photos === null ? (
        <div className="drive-loading">
          <Icon name="loader" size={22} className="spin" />
        </div>
      ) : visiblePhotos.length > 0 ? (
        <div className="photo-grid">
          {visiblePhotos.map((photo) => {
            return (
            <article className="photo-card" key={photo.id}>
              <button
                type="button"
                className="photo-open"
                onClick={() => setViewerId(photo.id)}
                aria-label={`${t.photos.open}: ${photo.title}`}
              >
                <img src={photo.previewUrl || photo.url} alt={photo.title} loading="lazy" />
              </button>
              <div className="photo-overlay">
                {photo.isSaved ? (
                  <span className="status-badge saved">
                    <Icon name="star" size={12} filled />
                    {t.photos.saved}
                  </span>
                ) : (
                  <span />
                )}
                <div className="photo-actions">
                  <button
                    type="button"
                    className="photo-action"
                    onClick={() => handleToggleSave(photo)}
                    aria-label={t.photos.save}
                    title={t.photos.save}
                  >
                    <Icon name="star" size={16} filled={photo.isSaved} />
                  </button>
                  <button
                    type="button"
                    className="photo-action danger"
                    onClick={() => setDeleteTarget(photo)}
                    aria-label={t.photos.delete}
                    title={t.photos.delete}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </div>
              <div className="photo-info">
                <strong title={photo.title}>{photo.title}</strong>
                <span>
                  {formatBytes(photo.rawSize)} · {formatDate(photo.createdAt, lang, false)}
                </span>
              </div>
            </article>
            );
          })}
        </div>
      ) : query ? (
        <EmptyState
          icon="search"
          title={t.photos.noResultsTitle}
          text={t.photos.noResultsText}
          actionLabel={t.common.clearSearch}
          actionIcon="close"
          onAction={onClearSearch}
        />
      ) : (
        <EmptyState
          icon="image"
          title={t.photos.emptyTitle}
          text={t.photos.emptyText}
        />
      )}

      {viewerPhoto &&
        createPortal(
          <div
            className="photo-viewer"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setViewerId(null);
            }}
          >
            <div className="viewer-topbar">
              <span className="viewer-counter">
                {interpolate(t.photos.viewerOf, { current: viewerIndex + 1, total: visiblePhotos.length })}
              </span>
              <div className="viewer-actions">
                <button
                  type="button"
                  className="icon-btn light"
                  onClick={() => downloadPhoto(viewerPhoto)}
                  title={t.files.download}
                  aria-label={t.files.download}
                >
                  <Icon name="download" size={19} />
                </button>
                <button type="button" className="icon-btn light" onClick={() => setViewerId(null)} aria-label={t.photos.close}>
                  <Icon name="close" size={20} />
                </button>
              </div>
            </div>
            {visiblePhotos.length > 1 && (
              <button
                type="button"
                className="viewer-arrow left"
                onClick={() =>
                  setViewerId(visiblePhotos[(viewerIndex - 1 + visiblePhotos.length) % visiblePhotos.length].id)
                }
                aria-label={t.photos.prev}
              >
                <Icon name="chevronLeft" size={26} />
              </button>
            )}
            <div className="viewer-stage">
              <img src={viewerPhoto.previewUrl || viewerPhoto.url} alt={viewerPhoto.title} />
              <div className="viewer-caption">
                <strong>{viewerPhoto.title}</strong>
                <span>
                  {formatDate(viewerPhoto.createdAt, lang)} · {formatBytes(viewerPhoto.rawSize)}
                </span>
              </div>
            </div>
            {visiblePhotos.length > 1 && (
              <button
                type="button"
                className="viewer-arrow right"
                onClick={() => setViewerId(visiblePhotos[(viewerIndex + 1) % visiblePhotos.length].id)}
                aria-label={t.photos.next}
              >
                <Icon name="chevronRight" size={26} />
              </button>
            )}
          </div>,
          document.body,
        )}

      {deleteTarget && (
        <ConfirmDialog
          title={t.photos.deleteTitle}
          text={interpolate(t.photos.deleteText, { name: deleteTarget.title })}
          confirmLabel={t.drive.toTrash}
          cancelLabel={t.common.cancel}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </section>
  );
}
