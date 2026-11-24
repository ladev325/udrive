import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { initials } from '../utils/formatters';
import { interpolate } from '../utils/i18n';

const searchableTabs = ['files', 'photos', 'saved', 'trash', 'notes'];

export default function Header({
  activeTab,
  searchQuery,
  setSearchQuery,
  t,
  user,
  onLogout,
  onOpenMenu,
  onNavigate,
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const searchRef = useRef(null);
  const profileRef = useRef(null);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') setProfileOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    if (!profileOpen) return undefined;
    const handleClick = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [profileOpen]);

  const showSearch = searchableTabs.includes(activeTab);
  const searchPlaceholder = showSearch
    ? interpolate(t.header.searchIn, { section: t.nav[activeTab] })
    : t.header.searchAll;

  return (
    <header className="app-header">
      <div className="header-left">
        <button type="button" className="icon-btn mobile-menu-btn" onClick={onOpenMenu} aria-label={t.header.openMenu}>
          <Icon name="menu" size={22} />
        </button>
        <div className="mobile-brand">
          <span className="brand-mark">
            <Icon name="sparkles" size={17} />
          </span>
          <span className="brand-word">
            {t.common.appName}
            <span>{t.common.appSuffix}</span>
          </span>
        </div>
        {!showSearch && (
          <div className="header-context">
            <span>{t.common.appName}</span>
            <Icon name="chevronRight" size={13} />
            <strong>{t.nav[activeTab]}</strong>
          </div>
        )}
        {showSearch && (
          <label className="search-box">
            <Icon name="search" size={18} />
            <input
              ref={searchRef}
              className="search-input"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear"
                onClick={() => setSearchQuery('')}
                aria-label={t.common.close}
              >
                <Icon name="close" size={15} />
              </button>
            )}
          </label>
        )}
      </div>

      <div className="header-right">
        <div className="profile-wrap" ref={profileRef}>
          <button
            type="button"
            className={`profile-button ${profileOpen ? 'open' : ''}`}
            onClick={() => setProfileOpen((value) => !value)}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            aria-label={t.header.profile}
          >
            <span className="avatar">{initials(user.name, user.email)}</span>
            <span className="profile-button-copy">
              <strong>{user.name || user.email.split('@')[0]}</strong>
              <small>{user.provider === 'google' ? t.header.viaGoogle : t.header.viaEmail}</small>
            </span>
            <Icon name="chevronDown" size={16} />
          </button>

          {profileOpen && (
            <div className="profile-menu" role="menu">
              <div className="profile-menu-head">
                <span className="avatar avatar-lg">{initials(user.name, user.email)}</span>
                <div>
                  <strong>{user.name || user.email.split('@')[0]}</strong>
                  <small>{user.email}</small>
                  <span className="provider-chip">
                    {user.provider === 'google' ? <Icon name="globe" size={12} /> : <Icon name="mail" size={12} />}
                    {user.provider === 'google' ? t.settings.viaGoogle : t.settings.viaEmail}
                  </span>
                </div>
              </div>
              <div className="profile-menu-list">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProfileOpen(false);
                    onNavigate('settings');
                  }}
                >
                  <Icon name="settings" size={17} />
                  {t.header.settings}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProfileOpen(false);
                    onNavigate('vault');
                  }}
                >
                  <Icon name="lock" size={17} />
                  {t.header.vault}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => {
                    setProfileOpen(false);
                    onLogout();
                  }}
                >
                  <Icon name="logout" size={17} />
                  {t.header.logout}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
