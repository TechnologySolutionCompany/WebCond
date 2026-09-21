import { createRouter } from '../_lib/router.js'
import * as residentsCreate from '../_admin/residents/create.js'
import * as residentsDelete from '../_admin/residents/delete.js'
import * as unitsSave from '../_admin/units/save.js'
import * as unitsDelete from '../_admin/units/delete.js'
import * as unitsImportAnalyze from '../_admin/units/import-analyze.js'
import * as unitsImportConfirm from '../_admin/units/import-confirm.js'
import * as signupLink from '../_admin/signup/link.js'
import * as signupReview from '../_admin/signup/review.js'

// /api/admin/billing/render-pdf continua em funcao propria: carrega o Chromium e e pesada.
export const { GET, POST } = createRouter({
  '/api/admin/residents-create': residentsCreate,
  '/api/admin/residents-delete': residentsDelete,
  '/api/admin/units-save': unitsSave,
  '/api/admin/units-delete': unitsDelete,
  '/api/admin/units-import-analyze': unitsImportAnalyze,
  '/api/admin/units-import-confirm': unitsImportConfirm,
  '/api/admin/signup-link': signupLink,
  '/api/admin/signup-review': signupReview,
})
