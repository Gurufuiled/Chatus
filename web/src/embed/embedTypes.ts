export type LoginusProfilePayload = {
  sub?: string;
  userId?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  avatar?: string;
  email?: string;
};

export type LoginusInitMessage = {
  type: 'loginus:init';
  initData: string;
  profile?: LoginusProfilePayload;
};

export type LoginusProfileUpdatedMessage = {
  type: 'loginus:profileUpdated';
  initData: string;
  profile?: LoginusProfilePayload;
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

export type LoginusRequestInitMessage = {
  type: 'loginus:requestInit';
};

export type LoginusOutboundMessage =
  | LoginusReadyMessage
  | LoginusErrorMessage
  | LoginusFeatureRequiredMessage
  | LoginusRequestInitMessage;

export type LoginusInboundMessage =
  | LoginusInitMessage
  | LoginusProfileUpdatedMessage;
