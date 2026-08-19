import { PRODUCT_NAME } from '@/helpers/branding';
import { useStrictEffect } from '@/hooks/use-strict-effect';
import { memo } from 'react';

const DebugInfo = memo(() => {
  useStrictEffect(() => {
    console.log(
      `%c${PRODUCT_NAME}`,
      'font-size: 64px; font-weight: bold; color: #6C5CE7;'
    );
    console.log(
      '%cVersion: %s',
      'font-size: 16px; font-weight: bold;',
      VITE_APP_VERSION
    );
    console.log(
      '%cEnvironment: %s',
      'font-size: 16px; font-weight: bold;',
      import.meta.env.MODE
    );
    console.log(
      '%cVOXEN client runtime',
      'font-size: 12px; font-weight: bold;'
    );
    console.log(
      '%cDO NOT PASTE ANY CODE HERE, THIS IS A BROWSER TOOL INTENDED FOR DEVELOPERS ONLY. IF SOMEONE TOLD YOU TO COPY-PASTE SOMETHING HERE, IT IS A SCAM AND THEY ARE TRYING TO STEAL YOUR ACCOUNT!',
      'font-size: 12px; font-weight: bold; color: red; background: yellow; padding: 10px;'
    );
  }, []);

  return null;
});

export { DebugInfo };
