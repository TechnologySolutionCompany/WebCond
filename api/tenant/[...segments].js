import { createRouter } from '../_lib/router.js'
import * as chargeSummary from '../_tenant/charge-summary.js'

export const { GET, POST } = createRouter({
  '/api/tenant/charge-summary': chargeSummary,
})
