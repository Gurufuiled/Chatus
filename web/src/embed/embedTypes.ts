export type LoginusInitMessage = {
  type: 'loginus:init';
  initData: string;
};

export type LoginusReadyMessage = {
  type: 'loginus:ready';
};

export type LoginusErrorMessage = {
  type: 'loginus:error';
  message: string;
};

export type LoginusFeatureRequiredMessage = {
  type: 'loginus:featureRequired';
  feature: 'microphone';
};

export type LoginusOutboundMessage =
  | LoginusReadyMessage
  | LoginusErrorMessage
  | LoginusFeatureRequiredMessage;

export type LoginusInboundMessage = LoginusInitMessage;
