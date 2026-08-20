import { IconButton, type TIconButtonSize } from '@sharkord/ui';
import { Maximize, Minimize } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

type TFullscreenButtonProps = {
  isFullscreen: boolean;
  handleToggleFullscreen: () => void;
  className?: string;
  size?: TIconButtonSize;
};

const FullscreenButton = memo(
  ({
    isFullscreen,
    handleToggleFullscreen,
    className,
    size = 'default'
  }: TFullscreenButtonProps) => {
    const { t } = useTranslation('sidebar');

    return (
      <IconButton
        variant={isFullscreen ? 'default' : 'ghost'}
        icon={isFullscreen ? Minimize : Maximize}
        onClick={handleToggleFullscreen}
        title={isFullscreen ? t('exitFullscreen') : t('fullscreen')}
        size={size}
        className={className}
      />
    );
  }
);

FullscreenButton.displayName = 'FullscreenButton';

export { FullscreenButton };
