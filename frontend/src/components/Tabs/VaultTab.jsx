import { useEffect, useState } from 'react';
import Icon from '../Icon';
import EmptyState from '../EmptyState';
import TabHeader from '../TabHeader';
import ConfirmDialog from '../ConfirmDialog';
import VaultSetupForm from '../VaultSetupForm';
import UploadModal from '../Modals/UploadModal';
import {
  deleteVaultFile,
  downloadVaultFile,
  listVaultFiles,
  resetVault,
  unlockVault,
  uploadVaultFile,
  VaultError,
} from '../../utils/vault';
import { formatBytes, formatDate } from '../../utils/formatters';
import { interpolate } from '../../utils/i18n';
import { driveErrorMessage } from '../../utils/driveErrors';

function getExtension(name = '') {
  const parts = name.split('.');
  if (parts.length < 2) return 'FILE';
  return parts.pop().slice(0, 4).toUpperCase();
}

export default function VaultTab({ vaultConfig, setVaultConfig, vaultKey, setVaultKey, onStorageChanged, t, lang, notify }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [resetRequested, setResetRequested] = useState(false);

  useEffect(() => {
    if (!vaultKey) return undefined;
    let cancelled = false;
    listVaultFiles(vaultKey)
      .then((list) => {
        if (cancelled) return;
        setItems(list);
        setLoaded(true);
      })
      .catch(() => !cancelled && notify(t.auth.genericError, 'error'));
    return () => {
      cancelled = true;
      setItems([]);
      setLoaded(false);
    };
  }, [vaultKey, notify, t.auth.genericError]);

  const handleUnlock = async (event) => {
    event.preventDefault();
    setError('');
    if (!password) return;
    setUnlocking(true);
    try {
      setVaultKey(await unlockVault(vaultConfig, password));
      setPassword('');
    } catch (unlockError) {
      setError(
        unlockError instanceof VaultError && unlockError.code === 'CRYPTO_UNAVAILABLE'
          ? t.vault.cryptoUnavailable
          : t.vault.wrongPass,
      );
    } finally {
      setUnlocking(false);
    }
  };

  const handleSetupComplete = (key, config) => {
    setVaultConfig(config);
    setVaultKey(key);
    notify(t.vault.setupDone, 'success');
  };

  const handleLock = () => {
    setVaultKey(null);
    notify(t.vault.lockedToast, 'info');
  };

  const handleReset = async () => {
    setResetRequested(false);
    try {
      await resetVault();
      setVaultKey(null);
      setVaultConfig(null);
      setPassword('');
      notify(t.vault.resetDone, 'info');
      onStorageChanged?.();
    } catch {
      notify(t.auth.genericError, 'error');
    }
  };

  const handleUpload = async (files) => {
    const key = vaultKey;
    setUploading((count) => count + 1);
    try {
      for (const file of files) {
        try {
          const item = await uploadVaultFile(key, file);
          setItems((current) => [item, ...current]);
          notify(t.vault.uploaded, 'success');
        } catch (error) {
          notify(`${file.name}: ${driveErrorMessage(t, error)}`, 'error');
        }
      }
    } finally {
      setUploading((count) => count - 1);
      onStorageChanged?.();
    }
  };

  const handleDownload = async (item) => {
    setBusyId(item.id);
    try {
      await downloadVaultFile(vaultKey, item);
      notify(t.files.downloaded, 'info');
    } catch {
      notify(t.auth.genericError, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteVaultFile(target.id);
      setItems((current) => current.filter((item) => item.id !== target.id));
      notify(t.vault.deleted, 'success');
      onStorageChanged?.();
    } catch {
      notify(t.auth.genericError, 'error');
    }
  };

  if (!vaultConfig) {
    return (
      <section className="glass-panel tab-panel">
        <TabHeader
          icon="shield"
          title={t.vault.title}
          subtitle={t.vault.subtitle}
          meta={<span className="optional-chip">{t.vault.optional}</span>}
        />
        <div className="vault-setup-card">
          <span className="vault-hero-icon">
            <Icon name="shield" size={34} />
          </span>
          <span className="optional-badge">
            <Icon name="sparkles" size={13} />
            {t.vault.optional}
          </span>
          <h3>{t.vault.setupTitle}</h3>
          <p>{t.vault.setupText}</p>
          <VaultSetupForm t={t} onCreated={handleSetupComplete} />
        </div>
      </section>
    );
  }

  if (!vaultKey) {
    return (
      <section className="glass-panel tab-panel vault-locked-panel">
        <div className="vault-lock-screen">
          <span className="vault-hero-icon locked">
            <Icon name="lock" size={34} />
          </span>
          <span className="optional-badge">
            <Icon name="lock" size={13} />
            {t.vault.optional}
          </span>
          <h2>{t.vault.lockedTitle}</h2>
          <p>{t.vault.lockedText}</p>
          <form className="vault-unlock-form" onSubmit={handleUnlock}>
            <label className="field">
              <span className="field-control">
                <Icon name="key" size={18} />
                <input
                  className="form-control"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t.vault.passphrasePlaceholder}
                  autoComplete="current-password"
                  autoFocus
                />
                <button
                  type="button"
                  className="input-action"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? t.common.hidePassword : t.common.showPassword}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} size={17} />
                </button>
              </span>
            </label>
            {error && (
              <p className="form-error" role="alert">
                <Icon name="alert" size={16} />
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-accent w-100" disabled={unlocking || !password}>
              {unlocking ? <Icon name="loader" size={17} className="spin" /> : <Icon name="lock" size={17} />}
              {unlocking ? t.vault.unlocking : t.vault.unlock}
            </button>
          </form>
          <button type="button" className="link-button danger" onClick={() => setResetRequested(true)}>
            <Icon name="alert" size={14} />
            {t.vault.reset}
          </button>
          <p className="vault-tiny-note">{t.vault.changePass}</p>
        </div>

        {resetRequested && (
          <ConfirmDialog
            title={t.vault.resetTitle}
            text={t.vault.resetText}
            confirmLabel={t.vault.resetConfirm}
            cancelLabel={t.common.cancel}
            onConfirm={handleReset}
            onClose={() => setResetRequested(false)}
          />
        )}
      </section>
    );
  }

  return (
    <section className="glass-panel tab-panel">
      <TabHeader
        icon="shield"
        title={t.vault.title}
        subtitle={t.vault.subtitle}
        meta={interpolate(t.vault.count, { count: items.length })}
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={handleLock}>
              <Icon name="lock" size={17} />
              {t.vault.lock}
            </button>
            <button type="button" className="btn btn-accent" onClick={() => setShowUpload(true)} disabled={uploading > 0}>
              {uploading > 0 ? <Icon name="loader" size={18} className="spin" /> : <Icon name="upload" size={18} />}
              {uploading > 0 ? t.vault.encrypting : t.vault.add}
            </button>
          </>
        }
      />

      {!loaded ? (
        <div className="note-editor-empty">
          <Icon name="loader" size={24} className="spin" />
        </div>
      ) : items.length > 0 ? (
        <div className="file-list">
          <div className="file-row file-head" aria-hidden="true">
            <span>{t.files.name}</span>
            <span>{t.files.size}</span>
            <span>{t.files.added}</span>
            <span className="align-end">{t.files.actions}</span>
          </div>
          {items.map((item) => (
            <div className="file-row" key={item.id}>
              <div className="file-name-cell">
                <span className="file-type">{getExtension(item.name)}</span>
                <span className="file-name-copy">
                  <strong title={item.name}>{item.name}</strong>
                  <small>{formatDate(item.createdAt, lang)}</small>
                </span>
              </div>
              <span className="file-size">{formatBytes(item.rawSize)}</span>
              <span className="file-date">{formatDate(item.createdAt, lang, false)}</span>
              <div className="file-actions">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => handleDownload(item)}
                  disabled={busyId === item.id}
                  title={t.files.download}
                  aria-label={t.files.download}
                >
                  <Icon name={busyId === item.id ? 'loader' : 'download'} size={17} className={busyId === item.id ? 'spin' : ''} />
                </button>
                <button
                  type="button"
                  className="icon-btn danger"
                  onClick={() => setDeleteTarget(item)}
                  title={t.vault.delete}
                  aria-label={t.vault.delete}
                >
                  <Icon name="trash" size={17} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="lock"
          title={t.vault.emptyTitle}
          text={t.vault.emptyText}
          actionLabel={t.vault.emptyAction}
          onAction={() => setShowUpload(true)}
        />
      )}

      {showUpload && (
        <UploadModal t={t} onClose={() => setShowUpload(false)} onUpload={handleUpload} />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={t.vault.deleteTitle}
          text={interpolate(t.vault.deleteText, { title: deleteTarget.name })}
          confirmLabel={t.common.delete}
          cancelLabel={t.common.cancel}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </section>
  );
}
