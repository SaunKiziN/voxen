import { IconButton, type TIconButtonSize } from '@sharkord/ui';
import { Pin, PinOff } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

type TPinButtonProps = {
  isPinned: boolean;
  handlePinToggle: () => void;
  className?: string;
  size?: TIconButtonSize;
};

const PinButton = memo(
  ({
    isPinned,
    handlePinToggle,
    className,
    size = 'default'
  }: TPinButtonProps) => {
    const { t } = useTranslation('sidebar');

    return (
      <IconButton
        variant={isPinned ? 'default' : 'ghost'}
        icon={isPinned ? PinOff : Pin}
        onClick={handlePinToggle}
        title={isPinned ? t('unpin') : t('pin')}
        size={size}
        className={className}
      />
    );
  }
);

export { PinButton };
