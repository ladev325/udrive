import { useRef, useState } from 'react';
import Icon from '../Icon';
import TabHeader from '../TabHeader';
import ConfirmDialog from '../ConfirmDialog';
import { downloadFile, formatDate, initials } from '../../utils/formatters';
import { LANGUAGES } from '../../utils/i18n';

const ACCENTS = ['#22d3ee', '#8b5cf6', '#34d399', '#f59e0b', '#fb7185'];

export default function SettingsTab({
  user,
  lang,
  setLang,
  accentColor,
  setAccentColor,
  t,
  onLogout,
  onNavigate,
  notes,
  setNotes,
  vaultConfigured,
  notify,
}) {
  const [pendingImport, setPendingImport] = useState(null);
  const fileInput = useRef(null);

  const exportBackup = () => {
    const payload = {
      app: 'udrive',
      version: 1,
      exportedAt: new Date().toISOString(),
      user: { name: user.name, email: user.email },
      notes,
    };
    downloadFile(
      JSON.stringify(payload, null, 2),
      `udrive-backup-${new Date().toISOString().slice(0, 10)}.json`,
    );
    notify(t.settings.exportSuccess, 'success');
  };

  const handleImportFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const validNotes =
          Array.isArray(parsed.notes) &&
          parsed.notes.every((note) => note && typeof note === 'object');
        if (!validNotes) {
          throw new Error('Invalid backup');
        }
        setPendingImport(parsed);
      } catch {
        notify(t.settings.importError, 'error');
      }
    };
    reader.onerror = () => notify(t.settings.importError, 'error');
    reader.readAsText(file);
  };

  const applyImport = () => {
    if (!pendingImport) return;
    setNotes(pendingImport.notes);
    setPendingImport(null);
    notify(t.settings.importSuccess, 'success');
  };

  return (
    <section className="glass-panel tab-panel settings-panel">
      <TabHeader
        icon="settings"
        title={t.settings.title}
        subtitle={t.settings.subtitle}
      />

      <div className="settings-grid">
        <section className="settings-card profile-card">
          <span className="settings-card-icon">
            <Icon name="user" size={20} />
          </span>
          <div className="settings-card-head">
            <h3>{t.settings.profile}</h3>
            <p>{t.settings.profileText}</p>
          </div>
          <div className="profile-hero">
            <span className="avatar avatar-xl">{initials(user.name, user.email)}</span>
            <div>
              <strong>{user.name || user.email.split('@')[0]}</strong>
              <span>{user.email}</span>
              <span className="provider-chip">
                {user.provider === 'google' ? <Icon name="globe" size={13} /> : <Icon name="mail" size={13} />}
                {user.provider === 'google' ? t.settings.viaGoogle : t.settings.viaEmail}
              </span>
            </div>
          </div>
          <dl className="settings-list">
            <div>
              <dt>{t.settings.name}</dt>
              <dd>{user.name || '—'}</dd>
            </div>
            <div>
              <dt>{t.settings.email}</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>{t.settings.provider}</dt>
              <dd>{user.provider === 'google' ? t.settings.viaGoogle : t.settings.viaEmail}</dd>
            </div>
            <div>
              <dt>{t.settings.memberSince.replace(' {date}', '')}</dt>
              <dd>{formatDate(user.createdAt, lang, false)}</dd>
            </div>
          </dl>
        </section>

        <section className="settings-card">
          <span className="settings-card-icon">
            <Icon name="palette" size={20} />
          </span>
          <div className="settings-card-head">
            <h3>{t.settings.preferences}</h3>
            <p>{t.settings.languageText}</p>
          </div>
          <div className="settings-block">
            <span className="settings-label">{t.settings.language}</span>
            <div className="language-grid">
              {LANGUAGES.map((language) => (
                <button
                  key={language.code}
                  type="button"
                  className={`language-option ${lang === language.code ? 'active' : ''}`}
                  onClick={() => setLang(language.code)}
                >
                  <span>
                    <strong>{t.settings.languageNames[language.code]}</strong>
                    <small>{language.short}</small>
                  </span>
                  {lang === language.code && <Icon name="check" size={16} />}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-block">
            <span className="settings-label">{t.settings.accent}</span>
            <p className="settings-hint">{t.settings.accentText}</p>
            <div className="accent-row">
              {ACCENTS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`accent-swatch ${accentColor === color ? 'active' : ''}`}
                  style={{ background: color }}
                  onClick={() => setAccentColor(color)}
                  aria-label={`${t.settings.accent}: ${color}`}
                  title={color}
                >
                  {accentColor === color && <Icon name="check" size={16} />}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="settings-card">
          <span className="settings-card-icon">
            <Icon name="shield" size={20} />
          </span>
          <div className="settings-card-head">
            <h3>{t.settings.security}</h3>
            <p>{t.settings.securityText}</p>
          </div>
          <div className={`vault-status-box ${vaultConfigured ? 'on' : ''}`}>
            <span className="vault-status-icon">
              <Icon name={vaultConfigured ? 'lock' : 'shield'} size={20} />
            </span>
            <div>
              <strong>{vaultConfigured ? t.settings.vaultEnabled : t.settings.vaultDisabled}</strong>
              <p>{vaultConfigured ? t.settings.vaultEnabledText : t.settings.vaultDisabledText}</p>
            </div>
            <span className={`status-dot ${vaultConfigured ? 'on' : ''}`} />
          </div>
          <button type="button" className="btn btn-outline-soft" onClick={() => onNavigate('vault')}>
            <Icon name="arrowRight" size={17} />
            {vaultConfigured ? t.settings.manageVault : t.settings.setupVault}
          </button>
        </section>

        <section className="settings-card">
          <span className="settings-card-icon">
            <Icon name="database" size={20} />
          </span>
          <div className="settings-card-head">
            <h3>{t.settings.data}</h3>
            <p>{t.settings.dataText}</p>
          </div>
          <div className="data-actions">
            <button type="button" className="data-action" onClick={exportBackup}>
              <span className="quick-icon">
                <Icon name="download" size={19} />
              </span>
              <span>
                <strong>{t.settings.export}</strong>
                <small>{t.settings.exportText}</small>
              </span>
              <Icon name="chevronRight" size={17} />
            </button>
            <button type="button" className="data-action" onClick={() => fileInput.current?.click()}>
              <span className="quick-icon">
                <Icon name="upload" size={19} />
              </span>
              <span>
                <strong>{t.settings.import}</strong>
                <small>{t.settings.importText}</small>
              </span>
              <Icon name="chevronRight" size={17} />
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                handleImportFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </div>
          <p className="settings-local-note">
            <Icon name="info" size={14} />
            {t.settings.localOnly}
          </p>
        </section>

        <section className="settings-card">
          <span className="settings-card-icon">
            <Icon name="sparkles" size={20} />
          </span>
          <div className="settings-card-head">
            <h3>{t.settings.about}</h3>
            <p>{t.settings.aboutText}</p>
          </div>
          <div className="about-box">
            <span className="brand-mark large">
              <Icon name="sparkles" size={24} />
            </span>
            <div>
              <strong>
                {t.common.appName}
                <span>{t.common.appSuffix}</span>
              </strong>
              <small>{t.settings.developers}: ladev325, dangerNN</small>
            </div>
          </div>
        </section>

        <section className="settings-card">
          <span className="settings-card-icon danger">
            <Icon name="logout" size={20} />
          </span>
          <div className="settings-card-head">
            <h3>{t.settings.account}</h3>
            <p>{t.settings.accountText}</p>
          </div>
          <button type="button" className="btn btn-danger-soft" onClick={onLogout}>
            <Icon name="logout" size={17} />
            {t.settings.signOut}
          </button>
          <p className="settings-local-note">{t.settings.signOutText}</p>
        </section>
      </div>

      {pendingImport && (
        <ConfirmDialog
          title={t.settings.import}
          text={t.settings.importText}
          confirmLabel={t.common.confirm}
          cancelLabel={t.common.cancel}
          tone="info"
          onConfirm={applyImport}
          onClose={() => setPendingImport(null)}
        />
      )}
    </section>
  );
}
