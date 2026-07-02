/** Default business contact for waybill email actions (overridable via VITE_BUSINESS_EMAIL). */
export const IAW_BUSINESS_EMAIL =
  import.meta.env.VITE_BUSINESS_EMAIL?.trim() || 'noreply@example.com';
