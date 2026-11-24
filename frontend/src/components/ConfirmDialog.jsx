import Icon from './Icon';
import Modal from './Modal';

export default function ConfirmDialog({
  title,
  text,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  tone = 'danger',
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      size="sm"
      icon={<Icon name={tone === 'danger' ? 'alert' : 'info'} size={20} />}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-accent'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="confirm-text">{text}</p>
    </Modal>
  );
}
