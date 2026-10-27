from rest_framework import serializers
from .models import Department, User


class UserSerializer(serializers.ModelSerializer):
    avatarColor = serializers.CharField(source="avatar_color", read_only=True)
    name = serializers.CharField(
        source="first_name", max_length=150, required=False)
    lastname = serializers.CharField(
        source="last_name", max_length=150, required=False, allow_blank=True)
    birthDate = serializers.DateField(
        source="birth_date", required=False, allow_null=True)
    department = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(),
        required=False, allow_null=True)
    departmentName = serializers.CharField(
        source="department.name", read_only=True, default="")
    following = serializers.SerializerMethodField()
    followers = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "name", "lastname", "avatarColor", "email", "phone", "birthDate",
                  "bio", "department", "departmentName", "following", "followers"]
        read_only_fields = ["id"]

    def get_following(self, obj):
        return [str(x) for x in obj.outgoing_follows.values_list("author_id", flat=True)]

    def get_followers(self, obj):
        return [str(x) for x in obj.incoming_follows.values_list("follower_id", flat=True)]

    def validate(self, attrs):
        date = attrs.get("birth_date")
        if date:
            from django.utils import timezone
            if date > timezone.localdate():
                raise serializers.ValidationError(
                    {"birthDate": "Дата не может быть в будущем."})
        return attrs
