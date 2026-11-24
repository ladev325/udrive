import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon';
import TabHeader from '../TabHeader';
import EmptyState from '../EmptyState';
import ConfirmDialog from '../ConfirmDialog';
import NameDialog from '../Modals/NameDialog';
import MoveDialog from '../Modals/MoveDialog';
import { formatBytes, formatDate } from '../../utils/formatters';
import { interpolate } from '../../utils/i18n';
import {
  createFolder,
  downloadItem,
  listFolder,
  moveItem,
  renameItem,
  setItemSaved,
  trashItem,
} from '../../utils/api';
import { driveErrorMessage } from '../../utils/driveErrors';
import { filesFromDrop, isExternalFileDrag, isItemDrag, ITEM_DRAG_TYPE } from '../../utils/dropFiles';

function getExtension(name = '') {
  const parts = name.split('.');
  if (parts.length < 2) return 'FILE';
  return parts.pop().slice(0, 4).toUpperCase();
}

function ItemIcon({ item }) {
  if (item.isFolder) {
    return (
      <span className="file-type folder">
        <Icon name="folder" size={18} />
      </span>
    );
  }
  if (item.isImage) {
    return (
      <span className="file-type image">
        <Icon name="image" size={18} />
      </span>
    );
  }
  return <span className="file-type">{getExtension(item.name)}</span>;
}

// "More" menu of a row (rename, move, delete). Closes on outside click.
function RowMenu({ t, item, onRename, onMove, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const run = (action) => () => {
    setOpen(false);
    action(item);
  };

  return (
    <div className="row-menu" ref={ref}>
      <button
        type="button"
        className={`icon-btn ${open ? 'active' : ''}`}
        onClick={() => setOpen((value) => !value)}
        title={t.drive.more}
        aria-label={t.drive.more}
        aria-expanded={open}
      >
        <Icon name="more" size={17} />
      </button>
      {open && (
        <div className="row-menu-list" role="menu">
          <button type="button" role="menuitem" onClick={run(onRename)}>
            <Icon name="edit" size={15} />
            {t.drive.rename}
          </button>
          <button type="button" role="menuitem" onClick={run(onMove)}>
            <Icon name="arrowUpRight" size={15} />
            {t.drive.moveTo}
          </button>
          <button type="button" role="menuitem" className="danger" onClick={run(onDelete)}>
            <Icon name="trash" size={15} />
            {t.drive.toTrash}
          </button>
        </div>
      )}
    </div>
  );
}

function UploadList({ t, uploads, onDismiss }) {
  if (!uploads.length) return null;
  return (
    <div className="upload-list" aria-live="polite">
      {uploads.map((entry) => (
        <div className={`upload-row ${entry.status}`} key={entry.id}>
          <Icon
            name={entry.status === 'done' ? 'check' : entry.status === 'error' ? 'alert' : 'upload'}
            size={15}
          />
          <span className="upload-name" title={entry.name}>
            {entry.name}
          </span>
          <span className="upload-state">
            {entry.status === 'error'
              ? entry.error
              : entry.status === 'queued'
                ? t.drive.queued
                : `${Math.round(entry.progress * 100)}%`}
          </span>
          {entry.status === 'error' ? (
            <button type="button" className="icon-btn" onClick={() => onDismiss(entry.id)} aria-label={t.common.close}>
              <Icon name="close" size={14} />
            </button>
          ) : (
            <span className="upload-bar">
              <span style={{ width: `${Math.round(entry.progress * 100)}%` }} />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function FilesTab({
  t,
  lang,
  notify,
  searchQuery,
  onClearSearch,
  driveVersion,
  onDriveChanged,
  folderId,
  onOpenFolder,
  onUpload,
  onOpenUploadModal,
  uploads,
  onDismissUpload,
  newFolderSignal,
  onNewFolderSignalHandled,
}) {
  const [data, setData] = useState(null);
  const [nameDialog, setNameDialog] = useState(null); // { mode: 'create' } | { mode: 'rename', item }
  const [moveTarget, setMoveTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // folder id, 'root' (breadcrumb) or 'here' (panel)
  const draggedId = useRef(null);
  const panelDragDepth = useRef(0);

  useEffect(() => {
    let cancelled = false;
    listFolder(folderId)
      .then((next) => !cancelled && setData(next))
      .catch((error) => {
        if (cancelled) return;
        // The open folder was deleted or moved to the trash: go back to the root.
        if (error?.code === 'NOT_FOUND' && folderId) onOpenFolder(null);
        else notify(driveErrorMessage(t, error), 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [folderId, driveVersion, onOpenFolder, notify, t]);

  useEffect(() => {
    if (!newFolderSignal) return;
    // Opening the dialog is the intended response to the sidebar's "Folder" quick action.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNameDialog({ mode: 'create' });
    onNewFolderSignalHandled?.();
  }, [newFolderSignal, onNewFolderSignalHandled]);

  const items = data?.items || [];
  const query = searchQuery.trim().toLowerCase();
  const visibleItems = query ? items.filter((item) => item.name.toLowerCase().includes(query)) : items;
  const currentFolder = data?.folder || null;

  const fail = (error) => notify(driveErrorMessage(t, error), 'error');

  const handleNameSubmit = async (name) => {
    try {
      if (nameDialog.mode === 'create') {
        await createFolder(folderId, name);
        notify(t.drive.folderCreated, 'success');
      } else {
        await renameItem(nameDialog.item.id, name);
        notify(t.drive.renamed, 'success');
      }
      setNameDialog(null);
      onDriveChanged();
    } catch (error) {
      fail(error);
    }
  };

  const move = async (item, targetId) => {
    try {
      await moveItem(item.id, targetId);
      notify(interpolate(t.drive.moved, { name: item.name }), 'success');
      setMoveTarget(null);
      onDriveChanged();
    } catch (error) {
      fail(error);
    }
  };

  const handleToggleSave = async (item) => {
    setData((current) => ({
      ...current,
      items: current.items.map((entry) => (entry.id === item.id ? { ...entry, isSaved: !item.isSaved } : entry)),
    }));
    try {
      await setItemSaved(item.id, !item.isSaved);
      notify(item.isSaved ? t.files.unsavedToast : t.files.savedToast, item.isSaved ? 'info' : 'success');
      onDriveChanged();
    } catch (error) {
      setData((current) => ({
        ...current,
        items: current.items.map((entry) => (entry.id === item.id ? item : entry)),
      }));
      fail(error);
    }
  };

  const handleDelete = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await trashItem(target.id);
      notify(t.drive.trashed, 'success');
      onDriveChanged();
    } catch (error) {
      fail(error);
    }
  };

  const handleDownload = (item) => {
    downloadItem(item);
    notify(item.isFolder ? t.drive.zipStarted : t.files.downloaded, 'info');
  };

  // ---- drag & drop: moving items onto folders, uploading files from the computer ----

  const dropProps = (targetKey, targetFolderId) => ({
    onDragOver: (event) => {
      const movingSelf = isItemDrag(event) && draggedId.current === targetFolderId;
      if (!(isItemDrag(event) || isExternalFileDrag(event)) || movingSelf) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = isItemDrag(event) ? 'move' : 'copy';
      if (dropTarget !== targetKey) setDropTarget(targetKey);
    },
    onDragLeave: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget((value) => (value === targetKey ? null : value));
    },
    onDrop: (event) => {
      if (!(isItemDrag(event) || isExternalFileDrag(event))) return;
      event.preventDefault();
      event.stopPropagation();
      setDropTarget(null);
      panelDragDepth.current = 0;
      if (isItemDrag(event)) {
        const id = event.dataTransfer.getData(ITEM_DRAG_TYPE);
        const item = items.find((entry) => entry.id === id);
        if (item && id !== targetFolderId) move(item, targetFolderId);
      } else {
        onUpload(filesFromDrop(event.dataTransfer), targetFolderId);
      }
    },
  });

  // The whole panel accepts files from the computer (uploaded into the open folder).
  const panelDropProps = {
    onDragEnter: (event) => {
      if (!isExternalFileDrag(event)) return;
      panelDragDepth.current += 1;
      setDropTarget((value) => value || 'here');
    },
    onDragOver: (event) => {
      if (!isExternalFileDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (event) => {
      if (!isExternalFileDrag(event)) return;
      panelDragDepth.current = Math.max(0, panelDragDepth.current - 1);
      if (panelDragDepth.current === 0) setDropTarget((value) => (value === 'here' ? null : value));
    },
    onDrop: (event) => {
      if (!isExternalFileDrag(event)) return;
      event.preventDefault();
      panelDragDepth.current = 0;
      setDropTarget(null);
      onUpload(filesFromDrop(event.dataTransfer), folderId);
    },
  };

  const crumbs = [{ id: null, name: t.drive.root }, ...(data?.path || [])];

  return (
    <section className={`glass-panel tab-panel files-panel ${dropTarget === 'here' ? 'drop-active' : ''}`} {...panelDropProps}>
      <TabHeader
        icon="folder"
        title={t.files.title}
        subtitle={t.files.subtitle}
        meta={interpolate(t.drive.itemCount, { count: items.length })}
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setNameDialog({ mode: 'create' })}>
              <Icon name="plus" size={17} />
              {t.drive.newFolder}
            </button>
            <button type="button" className="btn btn-accent" onClick={onOpenUploadModal}>
              <Icon name="upload" size={18} />
              {t.files.upload}
            </button>
          </>
        }
      />

      <nav className="breadcrumbs" aria-label={t.drive.path}>
        {currentFolder && (
          <button
            type="button"
            className="icon-btn crumb-up"
            onClick={() => onOpenFolder(currentFolder.parentId)}
            title={t.drive.up}
            aria-label={t.drive.up}
          >
            <Icon name="arrowLeft" size={16} />
          </button>
        )}
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          const key = crumb.id || 'root';
          return (
            <span className="crumb-wrap" key={key}>
              {index > 0 && <Icon name="chevronRight" size={13} />}
              <button
                type="button"
                className={`crumb ${isLast ? 'current' : ''} ${dropTarget === `crumb:${key}` ? 'drop-target' : ''}`}
                onClick={() => !isLast && onOpenFolder(crumb.id)}
                aria-current={isLast ? 'page' : undefined}
                {...(isLast ? {} : dropProps(`crumb:${key}`, crumb.id))}
              >
                {index === 0 && <Icon name="cloud" size={14} />}
                {crumb.name}
              </button>
            </span>
          );
        })}
      </nav>

      <UploadList t={t} uploads={uploads} onDismiss={onDismissUpload} />

      {data === null ? (
        <div className="drive-loading">
          <Icon name="loader" size={22} className="spin" />
        </div>
      ) : visibleItems.length > 0 ? (
        <div className="file-list">
          <div className="file-row file-head" aria-hidden="true">
            <span>{t.files.name}</span>
            <span>{t.files.size}</span>
            <span>{t.drive.modified}</span>
            <span className="align-end">{t.files.actions}</span>
          </div>
          {visibleItems.map((item) => (
            <div
              className={`file-row ${item.isFolder ? 'is-folder' : ''} ${dropTarget === item.id ? 'drop-target' : ''}`}
              key={item.id}
              draggable
              onDragStart={(event) => {
                draggedId.current = item.id;
                event.dataTransfer.setData(ITEM_DRAG_TYPE, item.id);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => {
                draggedId.current = null;
                setDropTarget(null);
              }}
              onDoubleClick={() => item.isFolder && onOpenFolder(item.id)}
              {...(item.isFolder ? dropProps(item.id, item.id) : {})}
            >
              <div className="file-name-cell">
                <ItemIcon item={item} />
                <span className="file-name-copy">
                  {item.isFolder ? (
                    <button type="button" className="folder-link" onClick={() => onOpenFolder(item.id)} title={item.name}>
                      {item.name}
                    </button>
                  ) : (
                    <strong title={item.name}>{item.name}</strong>
                  )}
                  <small>
                    {item.isFolder ? t.drive.folder : formatBytes(item.rawSize)} · {formatDate(item.modifiedAt, lang, false)}
                  </small>
                </span>
              </div>
              <span className="file-size">{item.isFolder ? '—' : formatBytes(item.rawSize)}</span>
              <span className="file-date">{formatDate(item.modifiedAt, lang, false)}</span>
              <div className="file-actions">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => handleDownload(item)}
                  title={item.isFolder ? t.drive.downloadZip : t.files.download}
                  aria-label={item.isFolder ? t.drive.downloadZip : t.files.download}
                >
                  <Icon name="download" size={17} />
                </button>
                {!item.isFolder && (
                  <button
                    type="button"
                    className={`icon-btn ${item.isSaved ? 'is-starred' : ''}`}
                    onClick={() => handleToggleSave(item)}
                    title={item.isSaved ? t.files.removeSave : t.files.save}
                    aria-label={item.isSaved ? t.files.removeSave : t.files.save}
                  >
                    <Icon name="star" size={17} filled={item.isSaved} />
                  </button>
                )}
                <RowMenu
                  t={t}
                  item={item}
                  onRename={(target) => setNameDialog({ mode: 'rename', item: target })}
                  onMove={setMoveTarget}
                  onDelete={setDeleteTarget}
                />
              </div>
            </div>
          ))}
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
        <EmptyState
          icon="folder"
          title={currentFolder ? t.drive.emptyFolderTitle : t.files.emptyTitle}
          text={t.drive.emptyText}
          actionLabel={t.files.emptyAction}
          actionIcon="upload"
          onAction={onOpenUploadModal}
        />
      )}

      {dropTarget === 'here' && (
        <div className="drop-overlay" aria-hidden="true">
          <Icon name="upload" size={28} />
          <strong>{interpolate(t.drive.dropHere, { folder: currentFolder?.name || t.drive.root })}</strong>
        </div>
      )}

      {nameDialog && (
        <NameDialog
          t={t}
          title={nameDialog.mode === 'create' ? t.drive.newFolder : t.drive.rename}
          icon={nameDialog.mode === 'create' ? 'folder' : 'edit'}
          label={t.drive.name}
          initialValue={nameDialog.mode === 'rename' ? nameDialog.item.name : ''}
          submitLabel={nameDialog.mode === 'create' ? t.drive.create : t.drive.rename}
          onSubmit={handleNameSubmit}
          onClose={() => setNameDialog(null)}
        />
      )}

      {moveTarget && (
        <MoveDialog t={t} item={moveTarget} onMove={(target) => move(moveTarget, target)} onClose={() => setMoveTarget(null)} />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={deleteTarget.isFolder ? t.drive.trashFolderTitle : t.files.deleteTitle}
          text={interpolate(t.drive.trashText, { name: deleteTarget.name })}
          confirmLabel={t.drive.toTrash}
          cancelLabel={t.common.cancel}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </section>
  );
}
