import { UserPermissions } from '../models/user_permissions.js';

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
export function getUserPermissions(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(new UserPermissions(req.user).toJSON());
}
