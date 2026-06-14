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

export type LoginusOutboundMessage = LoginusReadyMessage | LoginusErrorMessage;

export type LoginusInboundMessage = LoginusInitMessage;
