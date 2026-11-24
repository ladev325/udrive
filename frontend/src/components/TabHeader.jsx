import Icon from './Icon';

export default function TabHeader({ icon, title, subtitle, actions, meta }) {
  return (
    <div className="tab-top">
      <div className="tab-title-group">
        {icon && (
          <span className="tab-title-icon">
            <Icon name={icon} size={22} />
          </span>
        )}
        <div>
          <div className="tab-title-line">
            <h2>{title}</h2>
            {meta && <span className="count-chip">{meta}</span>}
          </div>
          {subtitle && <p className="tab-subtitle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="tab-actions">{actions}</div>}
    </div>
  );
}
