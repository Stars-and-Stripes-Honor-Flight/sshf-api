/**
 * @swagger
 * /user/hasgroup:
 *   get:
 *     summary: Check whether the authenticated user belongs to a Workspace group
 *     description: >
 *       Auth-only probe used by the UI during sign-in. Does not require
 *       membership in ALLOWED_GROUP_EMAILS so non-members can still discover
 *       that they are unauthorized. Data routes enforce group membership
 *       separately via the authorize middleware. groupEmail is compared to
 *       role emails case-insensitively, matching authorize.
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
