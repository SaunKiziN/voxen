import i18n from 'i18next';
import { toast } from 'sonner';

const assertNotificationsPermission = async () => {
  if ('Notification' in window) {
    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      toast.error(i18n.t('settings:notificationPermissionDenied'));

      return;
    }
  }
};

export { assertNotificationsPermission };
