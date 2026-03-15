const ADMIN_ROLE_IDS = (process.env.ADMIN_ROLE_IDS || '').split(',').map(id => id.trim()).filter(Boolean)
const WHITELIST_REVIEWER_ROLE_ID = process.env.WHITELIST_REVIEWER_ROLE_ID || ''

interface FormForPermission {
  id: string
  reviewerRoleId?: string | null
}

/** Check if a user has admin access (full access to everything) */
export function isAdmin(userRoles: string[]): boolean {
  return userRoles.some(r => ADMIN_ROLE_IDS.includes(r))
}

/** Check if a user has access to review a specific form's applications.
 *  form = null means the default whitelist form. */
export function canReviewForm(userRoles: string[], form: FormForPermission | null): boolean {
  // Admins can review everything
  if (isAdmin(userRoles)) return true

  if (form === null) {
    // Whitelist form: check WHITELIST_REVIEWER_ROLE_ID
    return WHITELIST_REVIEWER_ROLE_ID ? userRoles.includes(WHITELIST_REVIEWER_ROLE_ID) : false
  }

  // Custom form: check the form's reviewerRoleId
  return form.reviewerRoleId ? userRoles.includes(form.reviewerRoleId) : false
}

/** Check if a user has access to the admin dashboard at all (is admin or reviewer of any form) */
export function hasAnyAccess(userRoles: string[]): boolean {
  if (isAdmin(userRoles)) return true
  if (WHITELIST_REVIEWER_ROLE_ID && userRoles.includes(WHITELIST_REVIEWER_ROLE_ID)) return true
  // Per-form reviewer roles are checked dynamically against the DB
  return false
}

/** Filter a list of forms to only those the user can review */
export function filterAccessibleForms(userRoles: string[], forms: FormForPermission[]): FormForPermission[] {
  if (isAdmin(userRoles)) return forms
  return forms.filter(form => canReviewForm(userRoles, form))
}

/** Check if user can access whitelist form */
export function canReviewWhitelist(userRoles: string[]): boolean {
  return canReviewForm(userRoles, null)
}
