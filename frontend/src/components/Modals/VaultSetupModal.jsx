import Icon from '../Icon';
import Modal from '../Modal';
import VaultSetupForm from '../VaultSetupForm';

export default function VaultSetupModal({ t, onClose, onCreated }) {
  return (
    <Modal
      title={t.vaultSetup.title}
      subtitle={t.vaultSetup.text}
      onClose={onClose}
      closeLabel={t.common.close}
      size="sm"
      icon={<Icon name="shield" size={21} />}
    >
      <span className="optional-badge">
        <Icon name="sparkles" size={13} />
        {t.vaultSetup.badge}
      </span>
      <VaultSetupForm
        t={t}
        compact
        onCreated={onCreated}
        onSkip={onClose}
      />
    </Modal>
  );
}
