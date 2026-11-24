import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

export default function Modal({
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
  size = 'md',
  className = '',
  closeLabel = 'Close',
}) {
  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="modal-backdrop-custom"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className={`modal-card glass-panel modal-${size} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
      >
        {(title || onClose) && (
          <div className="modal-head">
            <div className="modal-head-copy">
              {icon && <span className="modal-icon">{icon}</span>}
              <div>
                {title && <h3 className="modal-title">{title}</h3>}
                {subtitle && <p className="modal-subtitle">{subtitle}</p>}
              </div>
            </div>
            {onClose && (
              <button type="button" className="icon-btn" onClick={onClose} aria-label={closeLabel}>
                <Icon name="close" size={18} />
              </button>
            )}
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
