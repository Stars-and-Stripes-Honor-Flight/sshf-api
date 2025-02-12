export function getHasGroup(req, res) {
    const roles = req.user?.roles;
    const groupEmail = req.query.groupEmail;
    const hasGroup = roles?.some(role => role.email === groupEmail) ?? false;
    res.json({ hasgroup: hasGroup });
} 