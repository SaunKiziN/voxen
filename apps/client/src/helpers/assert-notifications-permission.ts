import i18n from 'i18next';
import { toast } from 'sonner';

const assertNotificationsPermission = async () => {
  if (!('Notification' in window)) {
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission === 'denied') {
    toast.error(i18n.t('settings:notificationPermissionDenied'));

    return false;
  }

  const permission = await Notification.requestPermission();

  if (permission !== 'granted') {
    toast.error(i18n.t('settings:notificationPermissionDenied'));

    return false;
  }

  return true;
};

export { assertNotificationsPermission };
