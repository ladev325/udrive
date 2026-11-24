import { useState } from 'react';
import Icon from '../Icon';
import Modal from '../Modal';

// Asks for a name (new folder, rename). onSubmit may return a promise; errors are shown by the caller.
export default function NameDialog({ title, icon = 'edit', label, initialValue = '', submitLabel, t, onSubmit, onClose }) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const name = value.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await onSubmit(name);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      closeLabel={t.common.close}
      size="sm"
      icon={<Icon name={icon} size={20} />}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button type="submit" form="name-dialog-form" className="btn btn-accent" disabled={!value.trim() || busy}>
            {busy && <Icon name="loader" size={16} className="spin" />}
            {submitLabel}
          </button>
        </>
      }
    >
      <form id="name-dialog-form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-label">{label}</span>
          <input
            className="form-control"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={255}
            autoFocus
            onFocus={(event) => {
              // Select the name without the extension, like file managers do.
              const dot = event.target.value.lastIndexOf('.');
              event.target.setSelectionRange(0, dot > 0 ? dot : event.target.value.length);
            }}
          />
        </label>
      </form>
    </Modal>
  );
}
