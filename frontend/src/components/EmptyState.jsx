import Icon from './Icon';

export default function EmptyState({
  icon = 'sparkles',
  title,
  text,
  actionLabel,
  actionIcon = 'plus',
  onAction,
  compact = false,
}) {
  return (
    <div className={`empty-state ${compact ? 'compact' : ''}`}>
      <span className="empty-icon" aria-hidden="true">
        <Icon name={icon} size={30} />
      </span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {actionLabel && onAction && (
        <button type="button" className="btn btn-accent" onClick={onAction}>
          <Icon name={actionIcon} size={17} />
          {actionLabel}
        </button>
      )}
    </div>
  );
}
