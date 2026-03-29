/* eslint-disable @typescript-eslint/no-explicit-any */
// Neutered Mixpanel Service to remove external tracking dependency

export const track = (...args: any[]) => {
  void args;
  return true;
};

export const identify = (...args: any[]) => {
  void args;
  return true;
};

export const verifyMixpanelSetup = () => {
  return {
    success: true,
    environment: "development",
    hasToken: true,
    isMixpanelInitialized: true,
  };
};

const MixpanelService = {
  track,
  identify,
  verifyMixpanelSetup,
};

export default MixpanelService;
