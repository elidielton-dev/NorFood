export { setActiveRiderTenant, getActiveRiderTenantId } from "./tenant";

export {
  getCurrentSession,
  subscribeToAuthChanges,
  loginRider,
  logoutRider,
} from "./auth";

export { subscribeToRiderDataChanges } from "./subscriptions";

export { fetchRiderAppState } from "./state";
export type { RiderRemoteState } from "./state";

export { updateRiderOnline, updateRiderProfile, uploadRiderAvatar } from "./profile";

export { acceptRiderDelivery, advanceRiderDelivery } from "./delivery-actions";

export { sendRiderLocation } from "./location";

export { reportRiderIncident } from "./incidents";

export { sendRiderMessage } from "./messages";

export { markNotificationsRead } from "./notifications";
