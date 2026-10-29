from django.db.models import Sum

from . import models as m, services as sv


def money(qs, field="amount"):
    return qs.aggregate(t=Sum(field))["t"] or 0


def finance(month):
    """Recettes, dépenses et trésorerie d'un mois. Les mensualités (Payment) et les autres recettes (Income) sont réunies."""
    start, end = month, sv.month_end(month)
    pay = m.Payment.objects.filter(paid_on__range=(start, end))
    inc = m.Income.objects.filter(date__range=(start, end))
    exp = m.Expense.objects.filter(date__range=(start, end))
    opening = m.SchoolSettings.get().opening_balance
    pay_all = m.Payment.objects.filter(paid_on__lte=end)
    inc_all = m.Income.objects.filter(date__lte=end)
    exp_all = m.Expense.objects.filter(date__lte=end)
    labels = dict(m.METHODS)
    by_method = {k: 0 for k in labels}
    for r in pay.values("method").annotate(t=Sum("amount")):
        by_method[r["method"]] += r["t"]
    for r in inc.values("method").annotate(t=Sum("amount")):
        by_method[r["method"]] += r["t"]
    accounts = []
    for k, lab in labels.items():
        bal = money(pay_all.filter(method=k)) + money(inc_all.filter(method=k)) - money(exp_all.filter(method=k))
        if k == "cash":
            bal += opening  # le solde initial est compté dans la caisse en espèces
        accounts.append({"key": k, "label": "Caisse (espèces)" if k == "cash" else lab, "balance": bal})
    by_source = [{"label": "Mensualités de scolarité", "total": money(pay)}]
    cats = dict(m.Income.CATEGORIES)
    by_source += [{"label": cats[r["category"]], "total": r["t"]} for r in inc.values("category").annotate(t=Sum("amount"))]
    ecats = dict(m.Expense.CATEGORIES)
    total_in = money(pay) + money(inc)
    return {
        "opening_balance": opening, "income": total_in, "expenses": money(exp),
        "treasury": opening + money(pay_all) + money(inc_all) - money(exp_all),
        "by_method": [{"label": labels[k], "total": v} for k, v in by_method.items() if v],
        "by_source": [x for x in by_source if x["total"]],
        "by_category": [{"label": ecats[r["category"]], "total": r["t"]} for r in exp.values("category").annotate(t=Sum("amount"))],
        "accounts": accounts,
    }


def monthly_report(month):
    rows = sv.dues(month)
    fin = finance(month)
    expected = sum(r["monthly_fee"] for r in rows)
    collected = sum(min(r["paid"], r["monthly_fee"]) for r in rows)
    received = money(m.Payment.objects.filter(paid_on__range=(month, sv.month_end(month))))
    classes = {}
    for r in rows:
        c = classes.setdefault(r["classroom"], {"classroom": r["classroom"], "students": 0, "expected": 0, "collected": 0, "unpaid": 0, "arrears": 0})
        c["students"] += 1
        c["expected"] += r["monthly_fee"]
        c["collected"] += min(r["paid"], r["monthly_fee"])
        c["unpaid"] += r["remaining"]
        c["arrears"] += r["arrears"]
    wh = list(m.WorkedHours.objects.filter(month=month).select_related("teacher"))
    return {
        "month": month.strftime("%Y-%m"), "expected": expected, "collected": collected, "unpaid": expected - collected,
        "tuition_received": received, "other_income": fin["income"] - received, "income": fin["income"],
        "expenses": fin["expenses"], "treasury": fin["treasury"], "arrears": sum(r["arrears"] for r in rows),
        "by_class": list(classes.values()), "by_method": fin["by_method"], "by_source": fin["by_source"],
        "by_category": fin["by_category"], "accounts": fin["accounts"],
        "salaries_calculated": sum(w.amount for w in wh), "salaries_paid": sum(w.amount for w in wh if w.paid),
        "salaries": [{"teacher": w.teacher.full_name, "amount": w.amount, "paid": w.paid} for w in wh],
    }


def annual_report(year):
    rows, tot = [], {"expected": 0, "collected": 0, "income": 0, "expenses": 0}
    for mo in sv.year_months(f"{year}-{year + 1}"):
        d = sv.dues(mo)
        f = finance(mo)
        r = {"month": mo.strftime("%Y-%m"), "expected": sum(x["monthly_fee"] for x in d),
             "collected": sum(min(x["paid"], x["monthly_fee"]) for x in d), "income": f["income"], "expenses": f["expenses"]}
        r["unpaid"] = r["expected"] - r["collected"]
        r["balance"] = r["income"] - r["expenses"]
        rows.append(r)
        for k in tot:
            tot[k] += r[k]
    tot["unpaid"] = tot["expected"] - tot["collected"]
    tot["balance"] = tot["income"] - tot["expenses"]
    return {"year": f"{year}-{year + 1}", "months": rows, "totals": tot, "treasury": rows and finance(sv.year_months(f"{year}-{year + 1}")[-1])["treasury"]}
