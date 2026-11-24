import Icon from './Icon';
import { formatBytes, initials } from '../utils/formatters';

const sections = [
  {
    key: 'workspace',
    items: [
      { tab: 'files', icon: 'folder', label: 'files' },
      { tab: 'photos', icon: 'image', label: 'photos' },
      { tab: 'saved', icon: 'star', label: 'saved', badge: 'saved' },
      { tab: 'trash', icon: 'trash', label: 'trash', badge: 'trash' },
    ],
  },
  {
    key: 'communication',
    items: [
      { tab: 'notes', icon: 'notes', label: 'notes', badge: 'notes' },
    ],
  },
  {
    key: 'security',
    items: [
      { tab: 'vault', icon: 'lock', label: 'vault' },
      { tab: 'sync', icon: 'smartphone', label: 'sync' },
      { tab: 'settings', icon: 'settings', label: 'settings' },
    ],
  },
];

export default function Sidebar({
  activeTab,
  onNavigate,
  t,
  user,
  savedCount,
  trashCount,
  notesCount,
  usedBytes,
  quotaBytes,
  onQuickUpload,
  onNewFolder,
  onNewNote,
  isOpen,
  onClose,
}) {
  const usedPercentage = Math.min(
    100,
    Math.max(0.8, quotaBytes > 0 ? (usedBytes / quotaBytes) * 100 : 0),
  ).toFixed(1);

  const badges = {
    saved: savedCount,
    trash: trashCount,
    notes: notesCount,
  };

  const handleNavigate = (tab) => {
    onNavigate(tab);
    onClose?.();
  };

  return (
    <aside className={`app-sidebar ${isOpen ? 'is-open' : ''}`} aria-label={t.nav.menu}>
      <div className="sidebar-inner glass-panel">
        <div className="sidebar-head">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              <Icon name="sparkles" size={19} />
            </span>
            <span className="brand-word">
              {t.common.appName}
              <span>{t.common.appSuffix}</span>
            </span>
          </div>
          <button type="button" className="icon-btn sidebar-close" onClick={onClose} aria-label={t.nav.closeMenu}>
            <Icon name="close" size={19} />
          </button>
        </div>

        <div className="sidebar-scroll">
          <div className="quick-actions">
            <span className="sidebar-label">{t.nav.quickActions}</span>
            <div className="quick-grid">
              <button type="button" className="quick-action" onClick={onQuickUpload}>
                <span className="quick-icon">
                  <Icon name="upload" size={17} />
                </span>
                {t.nav.upload}
              </button>
              <button type="button" className="quick-action" onClick={onNewFolder}>
                <span className="quick-icon">
                  <Icon name="folder" size={17} />
                </span>
                {t.drive.newFolderShort}
              </button>
              <button type="button" className="quick-action" onClick={onNewNote}>
                <span className="quick-icon">
                  <Icon name="notes" size={17} />
                </span>
                {t.nav.newNote}
              </button>
            </div>
          </div>

          <nav className="sidebar-nav">
            {sections.map((section) => (
              <div className="nav-section" key={section.key}>
                <span className="sidebar-label">{t.nav[section.key]}</span>
                {section.items.map((item) => {
                  const count = item.badge ? badges[item.badge] : 0;
                  return (
                    <button
                      type="button"
                      key={item.tab}
                      className={`sidebar-link ${activeTab === item.tab ? 'active' : ''}`}
                      onClick={() => handleNavigate(item.tab)}
                      aria-current={activeTab === item.tab ? 'page' : undefined}
                    >
                      <span className="nav-icon">
                        <Icon name={item.icon} size={19} />
                      </span>
                      <span className="nav-text">{t.nav[item.label]}</span>
                      {count > 0 && <span className="nav-badge">{count}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        <div className="sidebar-foot">
          <div className="storage-card">
            <div className="storage-top">
              <span>
                <Icon name="database" size={15} />
                {t.nav.storage}
              </span>
              <strong>
                {formatBytes(usedBytes)} <span>/ {formatBytes(quotaBytes, 0)}</span>
              </strong>
            </div>
            <div className={`storage-track ${Number(usedPercentage) >= 90 ? 'is-full' : ''}`} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Number(usedPercentage)}>
              <span style={{ width: `${usedPercentage}%` }} />
            </div>
          </div>

          <div className="sidebar-profile">
            <span className="avatar avatar-sm">{initials(user.name, user.email)}</span>
            <span className="sidebar-profile-copy">
              <strong>{user.name || user.email.split('@')[0]}</strong>
              <small>{user.email}</small>
            </span>
            <span className={`presence-dot ${user.provider === 'google' ? 'google' : ''}`} title={t.common.online} />
          </div>
        </div>
      </div>
    </aside>
  );
}
