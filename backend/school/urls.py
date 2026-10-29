from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from . import views as v

r = DefaultRouter()
for name, vs in [("users", v.UserViewSet), ("classrooms", v.ClassRoomViewSet), ("students", v.StudentViewSet),
                 ("payments", v.PaymentViewSet), ("incomes", v.IncomeViewSet), ("expenses", v.ExpenseViewSet),
                 ("teachers", v.TeacherViewSet), ("assignments", v.AssignmentViewSet), ("timetable", v.SlotViewSet),
                 ("teacher-absences", v.TeacherAbsenceViewSet), ("hours", v.WorkedHoursViewSet),
                 ("subjects", v.ClassSubjectViewSet), ("evaluations", v.EvaluationViewSet), ("absences", v.AbsenceViewSet)]:
    r.register(name, vs, basename=name)

urlpatterns = [
    path("auth/login/", v.Login.as_view()),
    path("auth/refresh/", TokenRefreshView.as_view()),
    path("settings/", v.SettingsView.as_view()),
    path("audit/", v.AuditView.as_view()),
    path("dues/", v.DuesView.as_view()),
    path("finance/", v.FinanceView.as_view()),
    path("dashboard/", v.DashboardView.as_view()),
    path("reports/<str:kind>/", v.ReportView.as_view()),
    path("export/<str:kind>/", v.ExportView.as_view()),
    path("results/", v.ResultsView.as_view()),
    path("bulletin/", v.BulletinView.as_view()),
    path("", include(r.urls)),
]
