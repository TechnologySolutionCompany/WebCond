import { createRouter } from '../_lib/router.js'
import * as status from '../_platform/status.js'
import * as condominiumsExport from '../_platform/condominiums/export.js'
import * as condominiumsImport from '../_platform/condominiums/import.js'
import * as condominiumsList from '../_platform/condominiums/list.js'
import * as condominiumsRegister from '../_platform/condominiums/register.js'
import * as condominiumsUpdate from '../_platform/condominiums/update.js'
import * as syndicPassword from '../_platform/condominiums/update-syndic-password.js'
import * as condominiumsDelete from '../_platform/condominiums/delete.js'
import * as supportTickets from '../_platform/support/tickets.js'
import * as supportAttachment from '../_platform/support/attachment.js'
import * as supportMessages from '../_platform/support/messages.js'
import * as condominiumsLogo from '../_platform/condominiums/logo.js'
import * as team from '../_platform/team.js'

export const { GET, POST } = createRouter({
  '/api/platform/status': status,
  '/api/platform/condominiums-export': condominiumsExport,
  '/api/platform/condominiums-import': condominiumsImport,
  '/api/platform/condominiums-list': condominiumsList,
  '/api/platform/condominiums-register': condominiumsRegister,
  '/api/platform/condominiums-update': condominiumsUpdate,
  '/api/platform/condominiums-syndic-password': syndicPassword,
  '/api/platform/condominiums-delete': condominiumsDelete,
  '/api/platform/support-tickets': supportTickets,
  '/api/platform/support-attachment': supportAttachment,
  '/api/platform/support-messages': supportMessages,
  '/api/platform/condominiums-logo': condominiumsLogo,
  '/api/platform/team': team,
})
