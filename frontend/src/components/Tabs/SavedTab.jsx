import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../Icon';
import TabHeader from '../TabHeader';
import EmptyState from '../EmptyState';
import ConfirmDialog from '../ConfirmDialog';
import { formatBytes, formatDate } from '../../utils/formatters';
import { interpolate } from '../../utils/i18n';
import { downloadItem, listSaved, setItemSaved, trashItem } from '../../utils/api';
import { driveErrorMessage } from '../../utils/driveErrors';

// Favorites: starred files from anywhere in the drive (images are shown as photos).
export default function SavedTab({ t, lang, searchQuery, onClearSearch, notify, driveVersion, onDriveChanged }) {
  const [saved, setSaved] = useState([]);
  const [viewerId, setViewerId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const query = searchQuery.trim().toLowerCase();

  useEffect(() => {
    let cancelled = false;
    listSaved()
      .then((list) => !cancelled && setSaved(list))
      .catch((error) => !cancelled && notify(driveErrorMessage(t, error), 'error'));
    return () => {
      cancelled = true;
    };
  }, [driveVersion, notify, t]);

  const savedFiles = useMemo(() => saved.filter((item) => !item.isImage), [saved]);
  const savedPhotos = useMemo(() => saved.filter((item) => item.isImage), [saved]);

  const visibleFiles = useMemo(
    () => (query ? savedFiles.filter((file) => file.name.toLowerCase().includes(query)) : savedFiles),
    [savedFiles, query],
  );
  const visiblePhotos = useMemo(
    () => (query ? savedPhotos.filter((photo) => photo.title.toLowerCase().includes(query)) : savedPhotos),
    [savedPhotos, query],
  );
  const viewerPhoto = visiblePhotos.find((photo) => photo.id === viewerId) || null;

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

  const handleDownload = (file) => {
    if (!downloadItem(file)) {
      notify(t.auth.genericError, 'error');
      return;
    }
    notify(t.files.downloaded, 'info');
  };

  const unsave = async (item) => {
    try {
      await setItemSaved(item.id, false);
      setSaved((current) => current.filter((entry) => entry.id !== item.id));
      notify(t.files.unsavedToast, 'info');
      onDriveChanged();
    } catch (error) {
      notify(driveErrorMessage(t, error), 'error');
    }
  };
  const removeFile = unsave;
  const removePhoto = unsave;

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { item } = deleteTarget;
    setDeleteTarget(null);
    try {
      await trashItem(item.id);
      if (viewerId === item.id) setViewerId(null);
      setSaved((current) => current.filter((entry) => entry.id !== item.id));
      notify(t.drive.trashed, 'success');
      onDriveChanged();
    } catch (error) {
      notify(driveErrorMessage(t, error), 'error');
    }
  };

  const hasAnything = savedFiles.length > 0 || savedPhotos.length > 0;
  const hasResults = visibleFiles.length > 0 || visiblePhotos.length > 0;

  return (
    <section className="glass-panel tab-panel">
      <TabHeader
        icon="star"
        title={t.saved.title}
        subtitle={t.saved.subtitle}
        meta={`${savedFiles.length + savedPhotos.length}`}
      />

      {!hasAnything ? (
        <EmptyState icon="star" title={t.saved.emptyTitle} text={t.saved.emptyText} />
      ) : !hasResults ? (
        <EmptyState
          icon="search"
          title={t.files.noResultsTitle}
          text={t.files.noResultsText}
          actionLabel={t.common.clearSearch}
          actionIcon="close"
          onAction={onClearSearch}
        />
      ) : (
        <div className="saved-sections">
          <section className="saved-section">
            <div className="section-heading">
              <h3>
                <Icon name="folder" size={18} />
                {t.saved.files}
                <span className="count-chip">{savedFiles.length}</span>
              </h3>
            </div>
            {visibleFiles.length > 0 ? (
              <div className="saved-file-list">
                {visibleFiles.map((file) => (
                  <div className="saved-file-row" key={file.id}>
                    <span className="file-type">{file.name.split('.').pop()?.slice(0, 4).toUpperCase() || 'FILE'}</span>
                    <span className="saved-file-copy">
                      <strong title={file.name}>{file.name}</strong>
                      <small>
                        {formatBytes(file.rawSize)} · {formatDate(file.createdAt, lang, false)}
                      </small>
                    </span>
                    <span className="status-badge saved">
                      <Icon name="star" size={12} filled />
                      {t.files.permanent}
                    </span>
                    <div className="saved-file-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => handleDownload(file)}
                        title={t.saved.download}
                        aria-label={t.saved.download}
                      >
                        <Icon name="download" size={17} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => removeFile(file)}
                      >
                        {t.saved.remove}
                      </button>
                      <button
                        type="button"
                        className="icon-btn danger"
                        onClick={() => setDeleteTarget({ type: 'file', item: file })}
                        title={t.saved.delete}
                        aria-label={t.saved.delete}
                      >
                        <Icon name="trash" size={17} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="section-empty">{t.saved.noFiles}</p>
            )}
          </section>

          <section className="saved-section">
            <div className="section-heading">
              <h3>
                <Icon name="image" size={18} />
                {t.saved.photos}
                <span className="count-chip">{savedPhotos.length}</span>
              </h3>
            </div>
            {visiblePhotos.length > 0 ? (
              <div className="saved-photo-grid">
                {visiblePhotos.map((photo) => (
                  <article className="saved-photo-card" key={photo.id}>
                    <button type="button" className="photo-open" onClick={() => setViewerId(photo.id)}>
                      <img src={photo.previewUrl || photo.url} alt={photo.title} loading="lazy" />
                    </button>
                    <div className="saved-photo-info">
                      <strong title={photo.title}>{photo.title}</strong>
                      <div className="saved-photo-actions">
                        <button type="button" className="btn btn-ghost btn-xs" onClick={() => removePhoto(photo)}>
                          {t.saved.remove}
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          onClick={() => setDeleteTarget({ type: 'photo', item: photo })}
                          aria-label={t.saved.delete}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="section-empty">{t.saved.noPhotos}</p>
            )}
          </section>
        </div>
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
              <span className="viewer-counter">{formatDate(viewerPhoto.createdAt, lang)}</span>
              <button type="button" className="icon-btn light" onClick={() => setViewerId(null)} aria-label={t.photos.close}>
                <Icon name="close" size={20} />
              </button>
            </div>
            <div className="viewer-stage">
              <img src={viewerPhoto.previewUrl || viewerPhoto.url} alt={viewerPhoto.title} />
              <div className="viewer-caption">
                <strong>{viewerPhoto.title}</strong>
                <span>{formatBytes(viewerPhoto.rawSize)}</span>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {deleteTarget && (
        <ConfirmDialog
          title={
            deleteTarget.type === 'file'
              ? t.saved.deleteFileTitle
              : t.saved.deletePhotoTitle
          }
          text={interpolate(
            deleteTarget.type === 'file' ? t.saved.deleteFileText : t.saved.deletePhotoText,
            { name: deleteTarget.item.name || deleteTarget.item.title },
          )}
          confirmLabel={t.drive.toTrash}
          cancelLabel={t.common.cancel}
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </section>
  );
}
