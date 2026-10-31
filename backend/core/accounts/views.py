from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import ValidationError
from .models import Department, Follow, User
from .serializers import UserSerializer
from .queries import user_data

class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return user_data(User.objects.all()).get(pk=self.request.user.pk)

class UsersView(generics.ListAPIView):
    serializer_class = UserSerializer

    def get_queryset(self):
        qs = user_data(User.objects.filter(
            is_active=True, is_superuser=False).order_by(
            "first_name", "last_name", "id"))
        query = self.request.query_params.get("q", "").strip()[:100]
        if query:
            qs = qs.filter(
                Q(first_name__icontains=query) |
                Q(last_name__icontains=query) |
                Q(department__name__icontains=query) |
                Q(email__icontains=query))
        department = self.request.query_params.get("department")
        return qs.filter(department_id=department) if department else qs

class UserView(generics.RetrieveAPIView):
    serializer_class = UserSerializer
    queryset = user_data(User.objects.filter(is_active=True))

class UserBatchView(APIView):
    def get(self, request):
        from uuid import UUID
        try:
            ids = [UUID(x)
                   for x in request.query_params.get("ids", "").split(",")
                   if x]
        except ValueError:
            raise ValidationError("Неверный UUID.")
        if len(ids) > 100:
            raise ValidationError("Не более 100 пользователей за запрос.")
        qs = user_data(User.objects.filter(id__in=ids, is_active=True))
        query = request.query_params.get("q", "").strip()[:100]
        if query:
            qs = qs.filter(
                Q(first_name__icontains=query) |
                Q(last_name__icontains=query))
        return Response(
            UserSerializer(
                qs, many=True, context={"request": request}).data)

class DepartmentView(APIView):
    def get(self, request):
        return Response(
            list(
                Department.objects.order_by("name").values(
                    "id", "name")))

class FollowView(APIView):
    def put(self, request, pk):
        target = get_object_or_404(User, pk=pk, is_active=True)
        if target.pk == request.user.pk:
            raise ValidationError("Нельзя подписаться на себя.")
        Follow.objects.get_or_create(follower=request.user, author=target)
        return Response({"following": True})

    def delete(self, request, pk):
        Follow.objects.filter(follower=request.user, author_id=pk).delete()
        return Response(status=204)
