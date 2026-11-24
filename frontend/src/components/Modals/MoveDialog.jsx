import { useEffect, useMemo, useState } from 'react';
import Icon from '../Icon';
import Modal from '../Modal';
import { listAllFolders } from '../../utils/api';
import { interpolate } from '../../utils/i18n';

// Folder picker for "Move to…". A folder can't be moved into itself or its own subfolders.
export default function MoveDialog({ item, t, onMove, onClose }) {
  const [folders, setFolders] = useState(null);
  const [target, setTarget] = useState(item.parentId || null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listAllFolders()
      .then((list) => !cancelled && setFolders(list))
      .catch(() => !cancelled && setFolders([]));
    return () => {
      cancelled = true;
    };
  }, []);

  // Tree rows in display order, with depth; the moved folder and its subtree are left out.
  const rows = useMemo(() => {
    if (!folders) return [];
    const children = new Map();
    folders.forEach((folder) => {
      const key = folder.parentId || null;
      if (!children.has(key)) children.set(key, []);
      children.get(key).push(folder);
    });
    const result = [];
    const walk = (parentId, depth) => {
      (children.get(parentId) || [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((folder) => {
          if (item.isFolder && folder.id === item.id) return;
          result.push({ ...folder, depth });
          walk(folder.id, depth + 1);
        });
    };
    walk(null, 0);
    return result;
  }, [folders, item]);

  const handleMove = async () => {
    setBusy(true);
    try {
      await onMove(target);
    } finally {
      setBusy(false);
    }
  };

  const unchanged = (item.parentId || null) === target;

  return (
    <Modal
      title={interpolate(t.drive.moveTitle, { name: item.name })}
      onClose={onClose}
      closeLabel={t.common.close}
      size="sm"
      icon={<Icon name="folder" size={20} />}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button type="button" className="btn btn-accent" onClick={handleMove} disabled={unchanged || busy}>
            {busy && <Icon name="loader" size={16} className="spin" />}
            {t.drive.moveHere}
          </button>
        </>
      }
    >
      <div className="move-tree" role="listbox" aria-label={t.drive.moveTo}>
        <button
          type="button"
          role="option"
          aria-selected={target === null}
          className={`move-tree-row ${target === null ? 'active' : ''}`}
          onClick={() => setTarget(null)}
        >
          <Icon name="cloud" size={16} />
          <span>{t.drive.root}</span>
        </button>
        {folders === null ? (
          <div className="move-tree-loading">
            <Icon name="loader" size={18} className="spin" />
          </div>
        ) : (
          rows.map((folder) => (
            <button
              type="button"
              role="option"
              key={folder.id}
              aria-selected={target === folder.id}
              className={`move-tree-row ${target === folder.id ? 'active' : ''}`}
              style={{ paddingLeft: 12 + (folder.depth + 1) * 18 }}
              onClick={() => setTarget(folder.id)}
            >
              <Icon name="folder" size={16} />
              <span>{folder.name}</span>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
