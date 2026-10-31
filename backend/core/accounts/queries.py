def user_data(queryset):
    return queryset.select_related("department").prefetch_related(
        "outgoing_follows", "incoming_follows")
