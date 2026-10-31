from django.db.models import Count, Exists, OuterRef, Subquery
from django.db.models.functions import Coalesce
from .models import Comment, Like


def post_data(queryset, user):
    def count_for(model):
        counts = model.objects.filter(post_id=OuterRef("pk")).order_by().values(
            "post_id").annotate(total=Count("pk")).values("total")
        return Coalesce(Subquery(counts[:1]), 0)

    return queryset.select_related("author", "author__department").prefetch_related(
        "author__outgoing_follows", "author__incoming_follows").annotate(
            _likes_count=count_for(Like), _comments_count=count_for(Comment),
            _is_liked=Exists(Like.objects.filter(post_id=OuterRef("pk"), user=user)))
