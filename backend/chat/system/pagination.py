from rest_framework.pagination import CursorPagination, PageNumberPagination

class Pages(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class ChatPages(CursorPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100
    ordering = ('-updated_at', '-id')
