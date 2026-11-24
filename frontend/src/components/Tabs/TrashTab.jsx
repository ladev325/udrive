import { useEffect, useState } from 'react';
import Icon from '../Icon';
import TabHeader from '../TabHeader';
import EmptyState from '../EmptyState';
import ConfirmDialog from '../ConfirmDialog';
import { formatBytes, formatDate } from '../../utils/formatters';
import { interpolate } from '../../utils/i18n';
import { deleteForever, downloadItem, emptyTrash, listTrash, restoreItem } from '../../utils/api';
import { driveErrorMessage } from '../../utils/driveErrors';

const DAY_MS = 24 * 60 * 60 * 1000;

function getExtension(name = '') {
  const parts = name.split('.');
  if (parts.length < 2) return 'FILE';
  return parts.pop().slice(0, 4).toUpperCase();
}

// Deleted files and folders. They stay here for 30 days, then the server removes them.
export default function TrashTab({ t, lang, searchQuery, onClearSearch, notify, driveVersion, onDriveChanged }) {
  const [items, setItems] = useState(null);
  const [confirm, setConfirm] = useState(null); // { mode: 'one', item } | { mode: 'all' }

  useEffect(() => {
    let cancelled = false;
    listTrash()
      .then((list) => !cancelled && setItems(list))
      .catch((error) => !cancelled && notify(driveErrorMessage(t, error), 'error'));
    return () => {
      cancelled = true;
    };
  }, [driveVersion, notify, t]);

  const query = searchQuery.trim().toLowerCase();
  const visible = (items || []).filter((item) => !query || item.name.toLowerCase().includes(query));
  const remove = (id) => setItems((current) => current.filter((item) => item.id !== id));

  const handleRestore = async (item) => {
    try {
      const restored = await restoreItem(item.id);
      remove(item.id);
      notify(interpolate(t.trash.restored, { name: restored.name }), 'success');
      onDriveChanged();
    } catch (error) {
      notify(driveErrorMessage(t, error), 'error');
    }
  };

  const handleConfirm = async () => {
    const action = confirm;
    setConfirm(null);
    try {
      if (action.mode === 'all') {
        await emptyTrash();
        setItems([]);
        notify(t.trash.emptied, 'success');
      } else {
        await deleteForever(action.item.id);
        remove(action.item.id);
        notify(t.trash.deletedForever, 'success');
      }
      onDriveChanged();
    } catch (error) {
      notify(driveErrorMessage(t, error), 'error');
    }
  };

  return (
    <section className="glass-panel tab-panel">
      <TabHeader
        icon="trash"
        title={t.trash.title}
        subtitle={t.trash.subtitle}
        meta={interpolate(t.drive.itemCount, { count: items?.length || 0 })}
        actions={
          <button
            type="button"
            className="btn btn-danger-soft"
            onClick={() => setConfirm({ mode: 'all' })}
            disabled={!items?.length}
          >
            <Icon name="trash" size={17} />
            {t.trash.empty}
          </button>
        }
      />

      {items === null ? (
        <div className="drive-loading">
          <Icon name="loader" size={22} className="spin" />
        </div>
      ) : visible.length > 0 ? (
        <div className="file-list trash-list">
          <div className="file-row file-head" aria-hidden="true">
            <span>{t.files.name}</span>
            <span>{t.files.size}</span>
            <span>{t.trash.remaining}</span>
            <span className="align-end">{t.files.actions}</span>
          </div>
          {visible.map((item) => {
            const daysLeft = Math.max(0, Math.ceil((item.expiresAt - Date.now()) / DAY_MS));
            return (
              <div className="file-row" key={item.id}>
                <div className="file-name-cell">
                  {item.isFolder ? (
                    <span className="file-type folder">
                      <Icon name="folder" size={18} />
                    </span>
                  ) : (
                    <span className="file-type">{getExtension(item.name)}</span>
                  )}
                  <span className="file-name-copy">
                    <strong title={item.name}>{item.name}</strong>
                    <small>{interpolate(t.trash.deletedOn, { date: formatDate(item.trashedAt, lang) })}</small>
                  </span>
                </div>
                <span className="file-size">{formatBytes(item.rawSize)}</span>
                <span className="file-status-cell" title={interpolate(t.trash.deletedOn, { date: formatDate(item.trashedAt, lang) })}>
                  <span className={`status-badge ${daysLeft <= 3 ? 'urgent' : 'expiring'}`}>
                    <Icon name="clock" size={13} />
                    {daysLeft <= 0 ? t.files.expiresToday : interpolate(t.files.expiresIn, { days: daysLeft })}
                  </span>
                </span>
                <div className="file-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => handleRestore(item)}
                    title={t.trash.restore}
                    aria-label={t.trash.restore}
                  >
                    <Icon name="refresh" size={17} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => downloadItem(item)}
                    title={item.isFolder ? t.drive.downloadZip : t.files.download}
                    aria-label={item.isFolder ? t.drive.downloadZip : t.files.download}
                  >
                    <Icon name="download" size={17} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn danger"
                    onClick={() => setConfirm({ mode: 'one', item })}
                    title={t.trash.deleteForever}
                    aria-label={t.trash.deleteForever}
                  >
                    <Icon name="trash" size={17} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : query ? (
        <EmptyState
          icon="search"
          title={t.files.noResultsTitle}
          text={t.files.noResultsText}
          actionLabel={t.common.clearSearch}
          actionIcon="close"
          onAction={onClearSearch}
        />
      ) : (
        <EmptyState icon="trash" title={t.trash.emptyTitle} text={t.trash.emptyText} />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.mode === 'all' ? t.trash.emptyTitleConfirm : t.trash.deleteForeverTitle}
          text={
            confirm.mode === 'all'
              ? t.trash.emptyTextConfirm
              : interpolate(t.trash.deleteForeverText, { name: confirm.item.name })
          }
          confirmLabel={confirm.mode === 'all' ? t.trash.empty : t.trash.deleteForever}
          cancelLabel={t.common.cancel}
          onConfirm={handleConfirm}
          onClose={() => setConfirm(null)}
        />
      )}
    </section>
  );
}
