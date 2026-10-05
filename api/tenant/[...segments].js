import { createRouter } from '../_lib/router.js'
import * as accountEmail from '../_tenant/account/email.js'
import * as accountPassword from '../_tenant/account/password.js'
import * as chargeSummary from '../_tenant/charge-summary.js'
import * as pushSubscribe from '../_tenant/push/subscribe.js'
import * as pushUnsubscribe from '../_tenant/push/unsubscribe.js'
import * as paymentCheck from '../_tenant/payment-check.js'
import * as feedbackSend from '../_lib/feedbackSend.js'

export const { GET, POST } = createRouter({
  // Propria conta: e-mail de acesso e senha (exigem a senha atual).
  '/api/tenant/account-email': accountEmail,
  '/api/tenant/account-password': accountPassword,
  '/api/tenant/charge-summary': chargeSummary,
  '/api/tenant/push-subscribe': pushSubscribe,
  '/api/tenant/push-unsubscribe': pushUnsubscribe,
  // v1.09A5: conferencia do pagamento online na volta para o app e envio de feedback.
  '/api/tenant/payment-check': paymentCheck,
  '/api/tenant/feedback': feedbackSend,
})
