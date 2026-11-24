import { useCallback, useEffect, useState } from 'react';

import { translations } from './data/translations';
import AuthScreen from './components/AuthScreen';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ToastStack from './components/Toast';
import useToasts from './hooks/useToasts';

import FilesTab from './components/Tabs/FilesTab';
import PhotosTab from './components/Tabs/PhotosTab';
import SavedTab from './components/Tabs/SavedTab';
import NotesTab from './components/Tabs/NotesTab';
import TrashTab from './components/Tabs/TrashTab';
import VaultTab from './components/Tabs/VaultTab';
import SettingsTab from './components/Tabs/SettingsTab';

import UploadModal from './components/Modals/UploadModal';
import VaultSetupModal from './components/Modals/VaultSetupModal';

import { fetchSession, signOut } from './utils/auth';
import { checkUpload, getStorage, UNAUTHORIZED_EVENT, uploadFile } from './utils/api';
import { driveErrorMessage, setDriveLimits } from './utils/driveErrors';
import { interpolate } from './utils/i18n';
import { uid } from './utils/formatters';
import { getVaultConfig } from './utils/vault';
import Icon from './components/Icon';
import TabHeader from './components/TabHeader';

const ALLOWED_TABS = ['files', 'photos', 'saved', 'trash', 'notes', 'vault', 'sync', 'settings'];
const MOBILE_NAV = ['files', 'photos', 'saved', 'notes'];

function Brand() {
  return (
    <div className="brand-lockup">
      <span className="brand-mark">
        <Icon name="sparkles" size={20} />
      </span>
      <span className="brand-word">
        UDrive
      </span>
    </div>
  );
}

function LoadingScreen({ t }) {
  return (
    <div className="app-loading">
      <Brand />
      <span className="loading-mark">
        <Icon name="loader" size={24} className="spin" />
      </span>
      <p>{t.common.loading}</p>
    </div>
  );
}

function MobileTabBar({ activeTab, onNavigate, onOpenMenu, t }) {
  return (
    <nav className="mobile-tabbar" aria-label={t.nav.menu}>
      {MOBILE_NAV.map((tab) => {
        const icons = { files: 'folder', photos: 'image', saved: 'star', notes: 'notes' };
        return (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? 'active' : ''}
            onClick={() => onNavigate(tab)}
          >
            <Icon name={icons[tab]} size={20} />
            <span>{t.nav[tab]}</span>
          </button>
        );
      })}
      <button
        type="button"
        className={!MOBILE_NAV.includes(activeTab) ? 'active' : ''}
        onClick={onOpenMenu}
      >
        <Icon name="menu" size={20} />
        <span>{t.nav.menu}</span>
      </button>
    </nav>
  );
}

function seedNotes(t) {
  const now = Date.now();
  return [
    {
      id: uid('note'),
      title: t.seed.welcomeTitle,
      body: t.seed.welcomeBody,
      tags: [t.seed.welcomeTag],
      color: 'cyan',
      pinned: true,
      createdAt: now - 120000,
      updatedAt: now - 120000,
    },
    {
      id: uid('note'),
      title: t.seed.ideasTitle,
      body: t.seed.ideasBody,
      tags: [t.seed.ideasTag],
      color: 'violet',
      pinned: false,
      createdAt: now - 600000,
      updatedAt: now - 600000,
    },
  ];
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}


function MainDashboard({ user, lang, setLang, accentColor, setAccentColor, t, onLogout }) {
  const [activeTab, setActiveTab] = useState(() => {
    const stored = localStorage.getItem('nexus_tab');
    if (stored === 'messages') return 'notes';
    return ALLOWED_TABS.includes(stored) ? stored : 'files';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showVaultSetup, setShowVaultSetup] = useState(false);
  const [vaultKey, setVaultKey] = useState(null);
  const [notesCreateSignal, setNotesCreateSignal] = useState(0);
  const [newFolderSignal, setNewFolderSignal] = useState(0);
  // null = no vault yet; otherwise the server-side vault config (salt + password check).
  const [vaultConfig, setVaultConfig] = useState(null);

  const [notes, setNotes] = useState(() => {
    const stored = readJSON(`nexus_notes_${user.id}`, null);
    return Array.isArray(stored) ? stored : seedNotes(t);
  });
  // Drive: storage numbers for the sidebar, the open folder, and a counter that makes tabs reload.
  const [storage, setStorage] = useState({ used: 0, quota: 0, maxFileSize: 0, savedCount: 0, trashCount: 0 });
  const [folderId, setFolderId] = useState(null);
  const [driveVersion, setDriveVersion] = useState(0);
  const [uploads, setUploads] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const { toasts, notify, dismiss } = useToasts();

  const refreshStorage = useCallback(async () => {
    try {
      const next = await getStorage();
      setDriveLimits(next);
      setStorage(next);
    } catch {
      // the sidebar keeps the previous numbers
    }
  }, []);

  const handleDriveChanged = useCallback(() => {
    setDriveVersion((value) => value + 1);
    refreshStorage();
  }, [refreshStorage]);

  // Files, photos and the vault live on the udrive server; notes stay in this browser.
  useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      try {
        const [serverVault] = await Promise.all([getVaultConfig(), refreshStorage()]);
        if (!mounted) return;
        setVaultConfig(serverVault);
        if (!serverVault && !localStorage.getItem(`nexus_vault_prompt_${user.id}`)) setShowVaultSetup(true);
      } catch (error) {
        console.error('Could not load data from the server:', error);
        if (mounted) notify(t.auth.genericError, 'error');
      } finally {
        if (mounted) setIsLoaded(true);
      }
    };
    loadData();
    return () => {
      mounted = false;
    };
    // Loads once per user; notify/t are only used for the error toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(`nexus_notes_${user.id}`, JSON.stringify(notes));
      } catch (error) {
        console.error('Не удалось сохранить заметки:', error);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [notes, user.id]);

  useEffect(() => localStorage.setItem('nexus_tab', activeTab), [activeTab]);

  useEffect(() => {
    document.documentElement.lang = lang === 'ua' ? 'uk' : lang;
  }, [lang]);

  useEffect(() => {
    if (!vaultKey) return undefined;
    let timer;
    const arm = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setVaultKey(null);
        notify(t.vault.lockedToast, 'info');
      }, 10 * 60 * 1000);
    };
    const events = ['pointerdown', 'keydown'];
    events.forEach((event) => document.addEventListener(event, arm));
    arm();
    return () => {
      if (timer) window.clearTimeout(timer);
      events.forEach((event) => document.removeEventListener(event, arm));
    };
  }, [vaultKey, notify, t.vault.lockedToast]);

  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
    };
  }, [sidebarOpen]);

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 992px)');
    const handleDesktop = () => {
      if (desktopQuery.matches) setSidebarOpen(false);
    };
    desktopQuery.addEventListener('change', handleDesktop);
    return () => desktopQuery.removeEventListener('change', handleDesktop);
  }, []);

  const handleNavigate = useCallback((tab) => {
    setActiveTab(tab);
    setSearchQuery('');
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleOpenFolder = useCallback((id) => {
    setFolderId(id || null);
    setSearchQuery('');
  }, []);

  const handleNotesSignalHandled = useCallback(() => setNotesCreateSignal(0), []);
  const handleNewFolderSignalHandled = useCallback(() => setNewFolderSignal(0), []);

  // Uploads files one by one into a folder. The server first confirms that they fit
  // (max file size and the user's quota), so nothing is sent when they can't.
  const uploadFiles = useCallback(
    async (fileList, parentId) => {
      const files = Array.from(fileList || []);
      if (files.length === 0) return;
      try {
        await checkUpload(files.map((file) => file.size));
      } catch (error) {
        notify(driveErrorMessage(t, error), 'error');
        return;
      }

      const batch = files.map((file) => ({ id: uid('up'), file, name: file.name, progress: 0, status: 'queued' }));
      setUploads((current) => [...current, ...batch]);
      const update = (id, patch) =>
        setUploads((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));

      let done = 0;
      for (const entry of batch) {
        update(entry.id, { status: 'uploading' });
        try {
          await uploadFile(entry.file, parentId, { onProgress: (progress) => update(entry.id, { progress }) });
          update(entry.id, { status: 'done', progress: 1 });
          done += 1;
          handleDriveChanged();
        } catch (error) {
          update(entry.id, { status: 'error', error: driveErrorMessage(t, error) });
          notify(`${entry.name}: ${driveErrorMessage(t, error)}`, 'error');
        }
      }
      if (done > 0) {
        notify(done === 1 ? t.toast.uploaded : interpolate(t.drive.uploadedMany, { count: done }), 'success');
      }
      // Finished entries disappear after a moment; failed ones stay until dismissed.
      window.setTimeout(() => {
        const ids = new Set(batch.map((entry) => entry.id));
        setUploads((current) => current.filter((entry) => !(ids.has(entry.id) && entry.status === 'done')));
      }, 2500);
    },
    [notify, t, handleDriveChanged],
  );

  const dismissUpload = useCallback(
    (id) => setUploads((current) => current.filter((entry) => entry.id !== id)),
    [],
  );

  const handleVaultSetupCreated = (key, config) => {
    localStorage.setItem(`nexus_vault_prompt_${user.id}`, '1');
    setVaultConfig(config);
    setVaultKey(key);
    setShowVaultSetup(false);
    notify(t.vault.setupDone, 'success');
  };

  const handleVaultSetupSkip = () => {
    localStorage.setItem(`nexus_vault_prompt_${user.id}`, '1');
    setShowVaultSetup(false);
    notify(t.toast.vaultLater, 'info');
  };

  const driveProps = {
    t,
    lang,
    notify,
    searchQuery,
    onClearSearch: () => setSearchQuery(''),
    driveVersion,
    onDriveChanged: handleDriveChanged,
  };

  if (!isLoaded) return <LoadingScreen t={t} />;

  return (
    <div className="app-shell" style={{ '--accent': accentColor }}>
      <Sidebar
        activeTab={activeTab}
        onNavigate={handleNavigate}
        t={t}
        user={user}
        savedCount={storage.savedCount}
        trashCount={storage.trashCount}
        notesCount={notes.length}
        usedBytes={storage.used}
        quotaBytes={storage.quota}
        onQuickUpload={() => {
          setActiveTab('files');
          setShowUpload(true);
          setSidebarOpen(false);
        }}
        onNewFolder={() => {
          setActiveTab('files');
          setSearchQuery('');
          setNewFolderSignal((value) => value + 1);
          setSidebarOpen(false);
        }}
        onNewNote={() => {
          setActiveTab('notes');
          setSearchQuery('');
          setNotesCreateSignal((value) => value + 1);
          setSidebarOpen(false);
        }}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <button
        type="button"
        className={`sidebar-backdrop ${sidebarOpen ? 'show' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-label={t.nav.closeMenu}
        tabIndex={sidebarOpen ? 0 : -1}
      />

      <div className="app-main">
        <Header
          activeTab={activeTab}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          t={t}
          user={user}
          onLogout={onLogout}
          onOpenMenu={() => setSidebarOpen(true)}
          onNavigate={handleNavigate}
        />

        <main className="page-content">
          <div className="tab-animate" key={activeTab}>
            {activeTab === 'files' && (
              <FilesTab
                {...driveProps}
                folderId={folderId}
                onOpenFolder={handleOpenFolder}
                onUpload={uploadFiles}
                onOpenUploadModal={() => setShowUpload(true)}
                uploads={uploads}
                onDismissUpload={dismissUpload}
                newFolderSignal={newFolderSignal}
                onNewFolderSignalHandled={handleNewFolderSignalHandled}
              />
            )}
            {activeTab === 'photos' && <PhotosTab {...driveProps} />}
            {activeTab === 'saved' && <SavedTab {...driveProps} />}
            {activeTab === 'trash' && <TrashTab {...driveProps} />}
            {activeTab === 'notes' && (
              <NotesTab
                notes={notes}
                setNotes={setNotes}
                t={t}
                lang={lang}
                searchQuery={searchQuery}
                onClearSearch={() => setSearchQuery('')}
                notify={notify}
                createSignal={notesCreateSignal}
                onCreateSignalHandled={handleNotesSignalHandled}
              />
            )}
            {activeTab === 'vault' && (
              <VaultTab
                vaultConfig={vaultConfig}
                setVaultConfig={setVaultConfig}
                vaultKey={vaultKey}
                setVaultKey={setVaultKey}
                onStorageChanged={refreshStorage}
                t={t}
                lang={lang}
                notify={notify}
              />
            )}
            {activeTab === 'sync' && (
              <section className="glass-panel tab-panel">
                <TabHeader icon="smartphone" title={t.sync.title} />
              </section>
            )}
            {activeTab === 'settings' && (
              <SettingsTab
                user={user}
                lang={lang}
                setLang={setLang}
                accentColor={accentColor}
                setAccentColor={setAccentColor}
                t={t}
                onLogout={onLogout}
                onNavigate={handleNavigate}
                notes={notes}
                setNotes={setNotes}
                vaultConfigured={Boolean(vaultConfig)}
                notify={notify}
              />
            )}
          </div>
        </main>
      </div>

      <MobileTabBar
        activeTab={activeTab}
        onNavigate={handleNavigate}
        onOpenMenu={() => setSidebarOpen(true)}
        t={t}
      />

      {showUpload && (
        <UploadModal
          t={t}
          onClose={() => setShowUpload(false)}
          onUpload={(files) => uploadFiles(files, folderId)}
        />
      )}

      {showVaultSetup && (
        <VaultSetupModal
          t={t}
          onClose={handleVaultSetupSkip}
          onCreated={handleVaultSetupCreated}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} closeLabel={t.common.close} />
    </div>
  );
}

export default function App() {
  const [lang, setLang] = useState(() => {
    const stored = localStorage.getItem('nexus_lang');
    return ['ru', 'ua', 'en'].includes(stored) ? stored : 'ru';
  });
  const [accentColor, setAccentColor] = useState(
    () => localStorage.getItem('nexus_accent') || '#22d3ee',
  );
  // undefined = still asking the server, null = logged out.
  const [user, setUser] = useState(undefined);

  const t = translations[lang] || translations.en;

  useEffect(() => {
    localStorage.setItem('nexus_lang', lang);
    document.documentElement.lang = lang === 'ua' ? 'uk' : lang;
  }, [lang]);

  useEffect(() => {
    localStorage.setItem('nexus_accent', accentColor);
    document.documentElement.style.setProperty('--accent', accentColor);
  }, [accentColor]);

  useEffect(() => {
    document.title = `${t.common.appName}${t.common.appSuffix} — ${t.auth.heroBadge}`;
  }, [t]);

  useEffect(() => {
    let mounted = true;
    fetchSession()
      .then((sessionUser) => mounted && setUser(sessionUser))
      .catch(() => mounted && setUser(null));
    // Any API call answered with 401 (expired/removed session) returns to the login screen.
    const handleUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => {
      mounted = false;
      window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, []);

  const handleLogin = (nextUser) => {
    setUser(nextUser);
  };

  const handleLogout = () => {
    signOut();
    localStorage.removeItem('nexus_tab');
    setUser(null);
  };

  if (user === undefined) return <LoadingScreen t={t} />;

  if (!user) {
    return (
      <AuthScreen
        lang={lang}
        setLang={setLang}
        t={t}
        onLogin={handleLogin}
      />
    );
  }

  return (
    <MainDashboard
      user={user}
      lang={lang}
      setLang={setLang}
      accentColor={accentColor}
      setAccentColor={setAccentColor}
      t={t}
      onLogout={handleLogout}
    />
  );
}
