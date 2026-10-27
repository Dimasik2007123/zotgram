from unittest.mock import patch

from django.test import Client, TestCase, override_settings
from rest_framework.test import APIClient

from .models import User, random_user_color


class UserColorTests(TestCase):
    def test_people_list_excludes_superusers(self):
        user = User.objects.create_user(username="employee")
        User.objects.create_superuser(username="admin", password="test-only")
        client = APIClient()
        client.force_authenticate(user)
        response = client.get("/api/core/users/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["id"] for row in response.json()["results"]], [str(user.pk)])

    @override_settings(YANDEX_CLIENT_ID="test", YANDEX_CLIENT_SECRET="test", YANDEX_ALLOWED_IDS=[])
    @patch("accounts.oauth.fetch_yandex", return_value={"id": "color-test"})
    def test_repeat_login_keeps_saved_color(self, provider):
        client = Client(enforce_csrf_checks=True)
        for attempt in range(2):
            csrf = client.get("/api/core/auth/csrf/").json()["csrfToken"]
            self.assertEqual(client.get("/api/core/auth/start/").status_code, 200)
            state = client.session["oauth_attempt"]["state"]
            with patch("accounts.models.hsv_to_rgb", return_value=(36 / 255, 116 / 255, 82 / 255)) as convert:
                response = client.post(
                    "/api/core/auth/callback/", {"code": "code", "state": state},
                    content_type="application/json", HTTP_X_CSRFTOKEN=csrf,
                )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["user"]["avatarColor"], "#247452")
            if attempt == 0:
                convert.assert_called_once()
            else:
                convert.assert_not_called()
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(User.objects.get().avatar_color, "#247452")

    def test_default_is_chosen_for_each_user_and_saved(self):
        with patch("accounts.models.hsv_to_rgb", side_effect=[(36 / 255, 116 / 255, 82 / 255), (130 / 255, 91 / 255, 179 / 255)]):
            first = User.objects.create_user(username="first")
            second = User.objects.create_user(username="second")
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(first.avatar_color, "#247452")
        self.assertEqual(second.avatar_color, "#825BB3")
        first.first_name = "Updated"
        first.save()
        first.refresh_from_db()
        self.assertEqual(first.avatar_color, "#247452")

    def test_api_returns_color_and_profile_update_cannot_replace_it(self):
        user = User.objects.create_user(username="reader")
        saved_color = user.avatar_color
        client = APIClient()
        client.force_authenticate(user)
        response = client.get("/api/core/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["avatarColor"], user.avatar_color)
        response = client.patch(
            "/api/core/me/", {"avatarColor": "#FFFFFF", "name": "Updated"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertEqual(user.avatar_color, saved_color)
        self.assertEqual(response.json()["avatarColor"], user.avatar_color)
        self.assertEqual(user.first_name, "Updated")


    def test_generated_colors_follow_hsv_limits(self):
        from colorsys import rgb_to_hsv

        for hue in (0, 60, 120, 180, 240, 300, 359):
            for saturation in (55, 85):
                for brightness in (45, 70):
                    with self.subTest(hue=hue, saturation=saturation, brightness=brightness):
                        with patch("accounts.models.randint", side_effect=[hue, saturation, brightness]):
                            color = random_user_color()
                        self.assertRegex(color, r"^#[0-9A-F]{6}$")
                        self.assertNotIn(color, ("#FFFFFF", "#000000"))
                        rgb = [int(color[index:index + 2], 16) / 255 for index in (1, 3, 5)]
                        _, actual_saturation, actual_brightness = rgb_to_hsv(*rgb)
                        # RGB rounding can change the converted percentages slightly.
                        self.assertAlmostEqual(actual_saturation, saturation / 100, delta=0.01)
                        self.assertAlmostEqual(actual_brightness, brightness / 100, delta=0.003)
