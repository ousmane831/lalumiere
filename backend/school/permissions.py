from rest_framework.permissions import BasePermission

SAFE = ("GET", "HEAD", "OPTIONS")


class RolePermission(BasePermission):
    """Chaque vue déclare roles = {"read": [...], "write": [...]}. Le directeur a tous les droits."""

    def has_permission(self, request, view):
        u = request.user
        if not (u and u.is_authenticated):
            return False
        if u.is_superuser or u.role == "director":
            return True
        rules = getattr(view, "roles", None)
        if rules is None:
            return True
        return u.role in rules.get("read" if request.method in SAFE else "write", [])
