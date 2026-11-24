import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import {
  AuthError,
  isValidEmail,
  isValidUsername,
  MIN_PASSWORD_LENGTH,
  signIn,
  signUp,
} from '../utils/auth';
import { LANGUAGES } from '../utils/i18n';

const errorKeyByCode = {
  INVALID_EMAIL: 'invalidEmail',
  INVALID_USERNAME: 'invalidUsername',
  PASSWORD_REQUIRED: 'passwordRequired',
  PASSWORD_SHORT: 'passwordShort',
  PASSWORD_LONG: 'passwordLong',
  MISSING_FIELDS: 'passwordRequired',
  USERNAME_TAKEN: 'usernameTaken',
  EMAIL_TAKEN: 'emailTaken',
  INVALID_CREDENTIALS: 'wrongCredentials',
  TOO_MANY_ATTEMPTS: 'tooManyAttempts',
  NETWORK_ERROR: 'networkError',
};

function Brand({ t }) {
  return (
    <div className="brand-lockup">
      <span className="brand-mark" aria-hidden="true">
        <Icon name="sparkles" size={20} />
      </span>
      <span className="brand-word">
        {t.common.appName}
        <span>{t.common.appSuffix}</span>
      </span>
    </div>
  );
}

export default function AuthScreen({ lang, setLang, t, onLogin }) {
  const [mode, setMode] = useState('signin');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const initialFocus = useRef(null);

  useEffect(() => {
    initialFocus.current?.focus();
  }, [mode]);

  const translateError = (code) => {
    const key = errorKeyByCode[code] || 'genericError';
    return t.auth[key] || t.auth.genericError;
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    setPassword('');
    setShowPassword(false);
  };

  const validate = () => {
    if (mode === 'signup' && !isValidUsername(username)) return t.auth.invalidUsername;
    if (!isValidEmail(email)) return t.auth.invalidEmail;
    if (!password) return t.auth.passwordRequired;
    if (mode === 'signup' && password.length < MIN_PASSWORD_LENGTH) return t.auth.passwordShort;
    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationError = validate();
    setError(validationError);
    if (validationError) return;

    setBusy(true);
    try {
      const user = mode === 'signup' ? await signUp(username, email, password) : await signIn(email, password);
      onLogin(user);
    } catch (submitError) {
      setError(submitError instanceof AuthError ? translateError(submitError.code) : t.auth.genericError);
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-aurora" aria-hidden="true">
        <span className="aurora-one" />
        <span className="aurora-two" />
        <span className="auth-grid" />
      </div>

      <div className="auth-topbar">
        <Brand t={t} />
        <div className="language-switch" role="group" aria-label={t.settings.language}>
          {LANGUAGES.map((language) => (
            <button
              key={language.code}
              type="button"
              className={`language-pill ${lang === language.code ? 'active' : ''}`}
              onClick={() => setLang(language.code)}
              aria-pressed={lang === language.code}
              aria-label={language.label}
              title={language.label}
            >
              {language.short}
            </button>
          ))}
        </div>
      </div>

      <div className="auth-shell">
        <aside className="auth-hero">
          <span className="eyebrow">
            <Icon name="sparkles" size={15} />
            {t.auth.heroBadge}
          </span>
          <h1>{t.auth.heroTitle}</h1>
          <p className="auth-hero-text">{t.auth.heroText}</p>

          <ul className="auth-features">
            <li>
              <span className="feature-icon">
                <Icon name="shield" size={18} />
              </span>
              <span>
                <strong>{t.auth.featureVaultTitle}</strong>
                <small>{t.auth.featureVaultText}</small>
              </span>
            </li>
            <li>
              <span className="feature-icon">
                <Icon name="smartphone" size={18} />
              </span>
              <span>
                <strong>{t.auth.featureSyncTitle}</strong>
                <small>{t.auth.featureSyncText}</small>
              </span>
            </li>
            <li>
              <span className="feature-icon">
                <Icon name="notes" size={18} />
              </span>
              <span>
                <strong>{t.auth.featureNotesTitle}</strong>
                <small>{t.auth.featureNotesText}</small>
              </span>
            </li>
          </ul>

          <div className="auth-visual" aria-hidden="true">
            <div className="visual-card visual-vault">
              <span className="visual-icon">
                <Icon name="lock" size={18} />
              </span>
              <div>
                <strong>{t.auth.cardVault}</strong>
                <small>{t.auth.cardVaultStatus}</small>
              </div>
              <span className="visual-dot" />
            </div>
            <div className="visual-card visual-notes">
              <div className="visual-note-head">
                <span>{t.auth.cardNotes}</span>
                <span className="tiny-badge">3</span>
              </div>
              <span className="visual-line long" />
              <span className="visual-line medium" />
              <span className="visual-line short" />
            </div>
            <div className="visual-pill">
              <Icon name="check" size={14} />
              {t.auth.cardSynced}
            </div>
            <div className="visual-orbit">
              <span className="orbit-core">
                <Icon name="cloud" size={24} />
              </span>
              <span className="orbit-ring ring-one" />
              <span className="orbit-ring ring-two" />
              <span className="orbit-dot dot-one" />
              <span className="orbit-dot dot-two" />
              <span className="orbit-dot dot-three" />
            </div>
          </div>

          <div className="auth-trust">
            <Icon name="shield" size={15} />
            {t.auth.securedBy}
            <span className="dot-separator" />
            {t.auth.localNote}
          </div>
        </aside>

        <section className="auth-main">
          <div className="auth-card glass-panel">
            <div className="auth-card-brand">
              <Brand t={t} />
            </div>

            <div className="auth-heading">
              <span className="auth-kicker">
                <Icon name="sparkles" size={14} />
                {t.auth.kicker}
              </span>
              <h2>{mode === 'signin' ? t.auth.welcomeBack : t.auth.createSpace}</h2>
              <p className="auth-subtitle">
                {mode === 'signin' ? t.auth.welcomeText : t.auth.createSpaceText}
              </p>
            </div>

            <div className="auth-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'signin'}
                className={mode === 'signin' ? 'active' : ''}
                onClick={() => switchMode('signin')}
              >
                {t.auth.signInTab}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'signup'}
                className={mode === 'signup' ? 'active' : ''}
                onClick={() => switchMode('signup')}
              >
                {t.auth.signUpTab}
              </button>
            </div>

            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              {mode === 'signup' && (
                <label className="field">
                  <span className="field-label">{t.auth.username}</span>
                  <span className="field-control">
                    <Icon name="user" size={17} />
                    <input
                      ref={initialFocus}
                      className="form-control"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder={t.auth.usernamePlaceholder}
                      autoComplete="username"
                      autoCapitalize="off"
                      spellCheck={false}
                      maxLength={32}
                    />
                  </span>
                </label>
              )}

              <label className="field">
                <span className="field-label">{t.auth.email}</span>
                <span className="field-control">
                  <Icon name="mail" size={17} />
                  <input
                    ref={mode === 'signin' ? initialFocus : undefined}
                    className="form-control"
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={t.auth.emailPlaceholder}
                    autoComplete="email"
                  />
                </span>
              </label>

              <label className="field">
                <span className="field-label">{t.auth.password}</span>
                <span className="field-control">
                  <Icon name="key" size={17} />
                  <input
                    className="form-control"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={mode === 'signup' ? t.auth.newPasswordPlaceholder : t.auth.passwordPlaceholder}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
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

              {mode === 'signup' && (
                <p className="auth-info-note">
                  <Icon name="info" size={16} />
                  {t.auth.usernameHint}
                </p>
              )}

              {error && (
                <p className="form-error" role="alert" aria-live="polite">
                  <Icon name="alert" size={16} />
                  {error}
                </p>
              )}

              <button type="submit" className="btn btn-accent w-100 auth-submit" disabled={busy}>
                {busy && <Icon name="loader" size={17} className="spin" />}
                {busy
                  ? mode === 'signin'
                    ? t.auth.signingIn
                    : t.auth.creating
                  : mode === 'signin'
                    ? t.auth.signIn
                    : t.auth.createAccount}
                {!busy && <Icon name="arrowRight" size={17} />}
              </button>
            </form>

            <p className="auth-switch">
              {mode === 'signin' ? t.auth.noAccount : t.auth.haveAccount}{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
              >
                {mode === 'signin' ? t.auth.signUpLink : t.auth.signInLink}
              </button>
            </p>

            <p className="auth-legal">{t.auth.privacy}</p>
          </div>

          <div className="auth-card-footer">
            <Icon name="shield" size={14} />
            {t.auth.localNote}
          </div>
        </section>
      </div>

    </div>
  );
}
