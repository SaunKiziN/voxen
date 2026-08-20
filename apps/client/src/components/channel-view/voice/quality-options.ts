import type { TStreamQuality, TStreamQualityLayer } from '@sharkord/shared';
import type { TFunction } from 'i18next';

type TSidebarTFunction = TFunction<'sidebar'>;

const getStreamQualityLayerLabel = (label: string, t: TSidebarTFunction) => {
  switch (label) {
    case 'Low':
      return t('qualityLow');
    case 'Medium':
      return t('qualityMedium');
    case 'High':
      return t('qualityHigh');
    default:
      return label;
  }
};

const getStreamQualityLabel = (
  quality: TStreamQuality,
  layers: TStreamQualityLayer[],
  t: TSidebarTFunction
) => {
  if (quality.mode === 'auto') return t('qualityAuto');

  const label = layers.find(
    (layer) => layer.spatialLayer === quality.spatialLayer
  )?.label;

  return label ? getStreamQualityLayerLabel(label, t) : undefined;
};

const getStreamQualityMetadataLabel = (
  quality: TStreamQuality,
  layers: TStreamQualityLayer[],
  t: TSidebarTFunction
) => {
  if (quality.mode === 'auto') return t('qualityAutoMetadata');

  const label = layers.find(
    (layer) => layer.spatialLayer === quality.spatialLayer
  )?.label;

  return label ? getStreamQualityLayerLabel(label, t) : undefined;
};

export {
  getStreamQualityLabel,
  getStreamQualityLayerLabel,
  getStreamQualityMetadataLabel
};
