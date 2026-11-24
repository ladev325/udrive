import Icon from './Icon';

const icons = {
  success: 'check',
  error: 'alert',
  info: 'info',
};

export default function ToastStack({ toasts, onDismiss, closeLabel = 'Dismiss' }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`nexus-toast toast-${toast.type}`}>
          <span className="toast-icon">
            <Icon name={icons[toast.type] || 'info'} size={17} />
          </span>
          <span className="toast-message">{toast.message}</span>
          <button
            type="button"
            className="toast-close"
            onClick={() => onDismiss(toast.id)}
            aria-label={closeLabel}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
