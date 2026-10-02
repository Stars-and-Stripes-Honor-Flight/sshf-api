import { UserPermissions } from '../models/user_permissions.js';

/**
 * @swagger
 * /user/hasgroup:
 *   get:
 *     summary: Check whether the authenticated user belongs to a Workspace group
 *     description: >
 *       Auth-only probe used by the UI during sign-in. Does not require
 *       FULL membership, so non-members can still discover that they are
 *       unauthorized. For groups listed in AUTHZ_ROLE_{READ,WRITE,FULL,MEDICAL,REVIEW}_GROUPS
 *       (ALLOWED_GROUP_EMAILS is the deprecated alias for FULL), hasgroup is
 *       true for a direct or nested Workspace member. Any other group is a
 *       direct membership only. Data routes enforce per-route permissions.
 *       Prefer GET /user/permissions for show/hide hints. groupEmail is
 *       compared to role emails case-insensitively.
 *     tags: [User]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: query
 *         name: groupEmail
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *         description: Workspace group email to check
 *     responses:
 *       200:
 *         description: Membership result for the requested group
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [hasgroup]
 *               properties:
 *                 hasgroup:
 *                   type: boolean
 *       401:
 *         description: Missing, invalid, or wrong-audience token
 *       503:
 *         description: Token introspection or Workspace Directory group lookup temporarily unavailable
 */
/**
 * @swagger
 * /user/permissions:
 *   get:
 *     summary: Summarize the authenticated user's roles and permissions
 *     description: >
 *       Auth-only permission summary for UI hints. Skips requirePermission
 *       so a signed-in user with no roles receives 200 and an empty
 *       permissions list. roles lists only the roles granted directly by
 *       group membership (a FULL user is ["FULL"], not READ and WRITE).
 *       permissions is the effective union, including inheritance. Group
 *       emails are omitted. The API still enforces permissions on each
 *       data route.
 *     tags: [User]
 *     security:
 *       - GoogleAuth: []
 *     responses:
 *       200:
 *         description: Effective roles and permissions for the signed-in user
 *         headers:
 *           Cache-Control:
 *             description: Per-user authorization data is not stored by caches
 *             schema:
 *               type: string
 *               example: no-store
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserPermissions'
 *       401:
 *         description: Missing, invalid, or wrong-audience token
 *       403:
 *         description: Email domain rejected by ALLOWED_EMAIL_DOMAINS
 *       503:
 *         description: Token introspection or Workspace Directory group lookup temporarily unavailable
 */
function normalizeGroupEmail(value) {
    return typeof value === 'string' ? value.toLowerCase() : '';
}

export function getHasGroup(req, res) {
    const roles = req.user?.roles;
    const requested = normalizeGroupEmail(req.query.groupEmail);
    const hasGroup = requested.length > 0 && (roles?.some(
        (role) => normalizeGroupEmail(role.email) === requested
    ) ?? false);
    res.json({ hasgroup: hasGroup });
}

export function getUserPermissions(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(new UserPermissions(req.user).toJSON());
}
