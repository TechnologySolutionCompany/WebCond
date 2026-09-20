import { createRouter } from '../_lib/router.js'
import * as residentsCreate from '../_admin/residents/create.js'
import * as residentsDelete from '../_admin/residents/delete.js'
import * as unitsSave from '../_admin/units/save.js'
import * as unitsDelete from '../_admin/units/delete.js'

// /api/admin/billing/render-pdf continua em funcao propria: carrega o Chromium e e pesada.
export const { GET, POST } = createRouter({
  '/api/admin/residents-create': residentsCreate,
  '/api/admin/residents-delete': residentsDelete,
  '/api/admin/units-save': unitsSave,
  '/api/admin/units-delete': unitsDelete,
})
