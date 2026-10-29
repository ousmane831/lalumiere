from django.apps import apps
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from . import models as m


@admin.register(m.User)
class LumUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("Rôle", {"fields": ("role",)}),)
    add_fieldsets = UserAdmin.add_fieldsets + (("Rôle", {"fields": ("role",)}),)
    list_display = ("username", "first_name", "last_name", "role", "is_active")


for model in apps.get_app_config("school").get_models():
    if model is not m.User:
        admin.site.register(model)
