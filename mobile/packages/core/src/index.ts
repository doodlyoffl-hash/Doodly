/* DOODLY mobile core — the shared backend layer for both apps.
   Screens import from "@doodly/core", never from a file path, so the
   package's internals can be reorganised without touching either app. */

export { PROD_BASE, apiBase, setApiBase, CONFIG_TTL_MS, type PublicConfig } from "./config";
export {
  getToken, setToken, getStoredUser, setStoredUser, clearSession,
  getSavedApiBase, saveApiBase, getCachedConfig, setCachedConfig,
  type StoredUser,
} from "./storage";
export { api, ApiError, backendReachable, setUnauthorizedHandler, type ApiErrorCode, type RequestOptions } from "./client";
export {
  loginWithEmail, loginWithGoogle, loginWithApple, requestOtp, verifyOtp,
  logout, restoreSession, normalisePhone, isValidIndianMobile,
  CUSTOMER_ROLES, DRIVER_ROLES, type AuthResult,
} from "./auth";
export {
  mutate, enqueue, sync, queueLength, pendingMutations,
  onQueueChange, deadLettered, clearDeadLetters, type QueuedMutation,
} from "./offline";
export { isOnline, onConnectivityChange, startConnectivityWatch } from "./net";
export { AuthProvider, useAuth, WrongAppError, type AuthStatus } from "./AuthContext";
export {
  getSummary as getDriverSummary, getRoute, getAvailability, setAvailability, updateStop, pingLocation,
  type DriverSummary, type RouteStop, type StopStatus, type MyRoute,
  type Availability, type DeliveryAction, type StopUpdate,
} from "./driver";
export {
  getCatalogue, variantsFor, variantPricePaise, isBuyable, isTrial, toPaise,
  type Catalogue, type CatalogueProduct, type CatalogueVariant,
  type TrialVariant, type SubscriptionVariant, type CataloguePlan,
} from "./catalogue";
export {
  getSummary as getAccountSummary, getProfile, updateProfile,
  getSettings, updateSettings,
  listAddresses, createAddress, updateAddress, deleteAddress, checkServiceable,
  getWallet, getRewards, getReferrals,
  getInbox, markNotificationsRead, registerDevice, unregisterDevice,
  type AccountSummary, type Profile, type NotificationSettings, type Address,
  type Wallet, type WalletTxn, type Rewards, type Referrals, type InboxItem,
  type RegisteredDevice,
} from "./account";
export {
  placeOrder, cancelCheckout, verifyPayment, validateCoupon,
  listOrders, getOrder, orderStatus,
  listSubscriptions, subscriptionAction,
  listDeliveries, getTracking, listInvoices, invoicePdfUrl,
  type CheckoutInput, type CheckoutResult, type RazorpayHandoff, type CheckoutAddressInput,
  type CouponPreview, type OrderSummary, type OrderDetail, type OrderItemLine,
  type Subscription, type SubscriptionAction, type DeliveryRecord, type Invoice,
} from "./checkout";
export {
  payWithRazorpay, paymentsAvailable, PaymentCancelled, PaymentUnavailable,
  type PaymentSuccess, type PayerDetails,
} from "./payments";
export {
  configureForegroundHandler, registerForPush, unregisterForPush,
  onNotificationResponse, routeFor, type PushRoute,
} from "./push";
export {
  initAnalytics, enableAnalyticsDebug, track, screen, identify, resetAnalytics,
  Events, type AnalyticsSink, type EventProps,
} from "./analytics";
export { useAppServices } from "./useAppServices";
export { resolveDeepLink, type ResolvedLink } from "./deeplink";
