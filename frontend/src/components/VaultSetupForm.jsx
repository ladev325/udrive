import { useState } from 'react';
import Icon from './Icon';
import { createVault, passphraseScore, VaultError } from '../utils/vault';

export default function VaultSetupForm({ t, onCreated, onSkip, compact = false }) {
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const score = passphraseScore(passphrase);
  const labels = [t.vault.strengthWeak, t.vault.strengthFair, t.vault.strengthStrong];

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (passphrase.length < 8) {
      setError(t.vault.tooShort);
      return;
    }
    if (passphrase !== confirmation) {
      setError(t.vault.mismatch);
      return;
    }
    setBusy(true);
    try {
      const { key, config } = await createVault(passphrase);
      onCreated?.(key, config);
    } catch (submitError) {
      setError(
        submitError instanceof VaultError && submitError.code === 'CRYPTO_UNAVAILABLE'
          ? t.vault.cryptoUnavailable
          : submitError instanceof VaultError && submitError.code === 'VAULT_EXISTS'
            ? t.vault.alreadyExists
            : t.auth.genericError,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={`vault-setup-form ${compact ? 'compact' : ''}`} onSubmit={handleSubmit}>
      <label className="field">
        <span className="field-label">{t.vault.passphrase}</span>
        <span className="field-control">
          <Icon name="key" size={17} />
          <input
            className="form-control"
            type={showPassphrase ? 'text' : 'password'}
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            placeholder={t.vault.passphrasePlaceholder}
            autoComplete="new-password"
            autoFocus
          />
          <button
            type="button"
            className="input-action"
            onClick={() => setShowPassphrase((value) => !value)}
            aria-label={showPassphrase ? t.common.hidePassword : t.common.showPassword}
          >
            <Icon name={showPassphrase ? 'eyeOff' : 'eye'} size={17} />
          </button>
        </span>
      </label>

      {passphrase && (
        <div className="passphrase-meter">
          <span className="passphrase-meter-label">
            {t.vault.strength}: <strong>{labels[score - 1]}</strong>
          </span>
          <span className="passphrase-bars" aria-hidden="true">
            {[1, 2, 3].map((level) => (
              <span key={level} className={level <= score ? `filled level-${score}` : ''} />
            ))}
          </span>
        </div>
      )}

      <label className="field">
        <span className="field-label">{t.vault.confirmPassphrase}</span>
        <span className="field-control">
          <Icon name="lock" size={17} />
          <input
            className="form-control"
            type={showPassphrase ? 'text' : 'password'}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={t.vault.confirmPlaceholder}
            autoComplete="new-password"
          />
        </span>
      </label>

      <p className="field-hint">
        <Icon name="info" size={15} />
        {t.vault.passphraseHint}
      </p>

      <div className="vault-warning">
        <Icon name="alert" size={18} />
        <span>{t.vault.warning}</span>
      </div>

      {error && (
        <p className="form-error" role="alert">
          <Icon name="alert" size={16} />
          {error}
        </p>
      )}

      <div className="vault-form-actions">
        <button type="submit" className="btn btn-accent" disabled={busy}>
          {busy ? <Icon name="loader" size={17} className="spin" /> : <Icon name="shield" size={17} />}
          {busy ? t.vault.creating : t.vault.create}
        </button>
        {onSkip && (
          <button type="button" className="btn btn-ghost" onClick={onSkip}>
            {t.vault.skip}
          </button>
        )}
      </div>
      {onSkip && <p className="skip-hint">{t.vault.skipHint}</p>}
    </form>
  );
}
