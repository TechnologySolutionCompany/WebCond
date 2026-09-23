import { createRouter } from '../_lib/router.js'
import * as chargeSummary from '../_tenant/charge-summary.js'
import * as pushSubscribe from '../_tenant/push/subscribe.js'
import * as pushUnsubscribe from '../_tenant/push/unsubscribe.js'

export const { GET, POST } = createRouter({
  '/api/tenant/charge-summary': chargeSummary,
  '/api/tenant/push-subscribe': pushSubscribe,
  '/api/tenant/push-unsubscribe': pushUnsubscribe,
})
