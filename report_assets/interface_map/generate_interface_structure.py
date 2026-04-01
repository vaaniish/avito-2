# -*- coding: utf-8 -*-
from pathlib import Path
import html

OUT_DIR = Path(r"C:\Study\diploma\avito-2\report_assets\interface_map")
OUT_DIR.mkdir(parents=True, exist_ok=True)


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def wrap(text: str, max_chars: int):
    words = text.split()
    if not words:
        return [""]
    lines = []
    cur = words[0]
    for w in words[1:]:
        nxt = f"{cur} {w}"
        if len(nxt) <= max_chars:
            cur = nxt
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines


# Single-root route tree (left-to-right)
tree = {
    "title": "Главная / каталог",
    "route": "/",
    "children": [
        {
            "title": "Карточка объявления",
            "route": "/products/:id",
            "children": [
                {
                    "title": "Корзина",
                    "route": "/cart",
                    "children": [
                        {
                            "title": "Оформление заказа",
                            "route": "/checkout",
                            "children": [
                                {
                                    "title": "Заказ оформлен",
                                    "route": "/order-complete",
                                    "children": [],
                                }
                            ],
                        }
                    ],
                }
            ],
        },
        {
            "title": "Авторизация и регистрация",
            "route": "/auth",
            "children": [
                {
                    "title": "Личный кабинет",
                    "route": "/profile",
                    "children": [
                        {"title": "Профиль", "route": "/profile", "children": []},
                        {"title": "Адреса", "route": "/profile/addresses", "children": []},
                        {"title": "Заказы", "route": "/profile/orders", "children": []},
                        {"title": "Избранное", "route": "/profile/wishlist", "children": []},
                        {"title": "Партнерство (заявка)", "route": "/profile/partnership", "children": []},
                        {"title": "Объявления партнера", "route": "/profile/partner-listings", "children": []},
                        {"title": "Вопросы покупателей", "route": "/profile/partner-questions", "children": []},
                        {"title": "Заказы партнера", "route": "/profile/partner-orders", "children": []},
                    ],
                }
            ],
        },
        {
            "title": "Вход администратора",
            "route": "/admin/login",
            "children": [
                {
                    "title": "Админ-панель",
                    "route": "/admin",
                    "children": [
                        {"title": "Сделки", "route": "/admin/transactions", "children": []},
                        {"title": "Жалобы", "route": "/admin/complaints", "children": []},
                        {"title": "Продавцы / KYC", "route": "/admin/sellers", "children": []},
                        {"title": "Объявления", "route": "/admin/listings", "children": []},
                        {"title": "Пользователи", "route": "/admin/users", "children": []},
                        {"title": "Комиссии", "route": "/admin/commissions", "children": []},
                        {"title": "Аудит", "route": "/admin/audit", "children": []},
                    ],
                }
            ],
        },
        {"title": "О компании", "route": "/about", "children": []},
        {"title": "FAQ", "route": "/faq", "children": []},
        {"title": "Политика конфиденциальности", "route": "/privacy", "children": []},
        {"title": "Условия использования", "route": "/terms", "children": []},
        {"title": "Партнерство (инфо)", "route": "/partnership", "children": []},
    ],
}

# Node style/layout
node_w = 190
node_pad_top = 10
node_pad_bottom = 8
title_font = 14
route_font = 13
line_h = 17
max_title_chars = 22

x_gap = 56
y_gap = 10
margin = 32


def node_height(node):
    title_lines = wrap(node["title"], max_title_chars)
    h = node_pad_top + len(title_lines) * line_h + 8 + line_h + node_pad_bottom
    return max(h, 62), title_lines


def attach_metrics(node):
    h, lines = node_height(node)
    node["_h"] = h
    node["_title_lines"] = lines
    for child in node.get("children", []):
        attach_metrics(child)


attach_metrics(tree)


def subtree_height(node):
    children = node.get("children", [])
    if not children:
        return node["_h"]
    total = 0
    for i, child in enumerate(children):
        total += subtree_height(child)
        if i < len(children) - 1:
            total += y_gap
    return max(node["_h"], total)


def max_depth(node, depth=0):
    children = node.get("children", [])
    if not children:
        return depth
    return max(max_depth(c, depth + 1) for c in children)


def layout(node, depth, y_top, placed):
    sub_h = subtree_height(node)
    y_center = y_top + sub_h / 2

    x = margin + depth * (node_w + x_gap)
    y = y_center - node["_h"] / 2
    placed.append({"node": node, "x": x, "y": y, "depth": depth})

    children = node.get("children", [])
    if not children:
        return

    children_total = 0
    for i, ch in enumerate(children):
        children_total += subtree_height(ch)
        if i < len(children) - 1:
            children_total += y_gap

    child_y = y_top + (sub_h - children_total) / 2
    for ch in children:
        layout(ch, depth + 1, child_y, placed)
        child_y += subtree_height(ch) + y_gap


placed_nodes = []
layout(tree, 0, margin, placed_nodes)
pos = {id(item["node"]): item for item in placed_nodes}

max_right = max(item["x"] + node_w for item in placed_nodes)
max_bottom = max(item["y"] + item["node"]["_h"] for item in placed_nodes)
extra_bottom_padding = 220
canvas_w = int(max_right + margin)
canvas_h = int(max_bottom + margin + extra_bottom_padding)

svg = []
svg.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{int(canvas_w)}" height="{int(canvas_h)}" viewBox="0 0 {int(canvas_w)} {int(canvas_h)}">')
svg.append('<rect x="0" y="0" width="100%" height="100%" fill="#FFFFFF"/>')

for item in placed_nodes:
    node = item["node"]
    children = node.get("children", [])
    if not children:
        continue

    parent_right = item["x"] + node_w
    parent_mid_y = item["y"] + node["_h"] / 2
    elbow_x = parent_right + x_gap / 2

    for child in children:
        ch_item = pos[id(child)]
        child_left = ch_item["x"]
        child_mid_y = ch_item["y"] + child["_h"] / 2
        svg.append(
            f'<path d="M {parent_right:.1f},{parent_mid_y:.1f} '
            f'L {elbow_x:.1f},{parent_mid_y:.1f} '
            f'L {elbow_x:.1f},{child_mid_y:.1f} '
            f'L {child_left:.1f},{child_mid_y:.1f}" '
            'fill="none" stroke="#94A3B8" stroke-width="1.4"/>'
        )

for item in placed_nodes:
    node = item["node"]
    x = item["x"]
    y = item["y"]
    h = node["_h"]

    fill = "#F8FAFC"
    stroke = "#CBD5E1"
    if node is tree:
        fill = "#E2E8F0"
        stroke = "#94A3B8"

    svg.append(
        f'<rect x="{x:.1f}" y="{y:.1f}" width="{node_w}" height="{h:.1f}" '
        f'rx="8" fill="{fill}" stroke="{stroke}" stroke-width="1.2"/>'
    )

    text_y = y + node_pad_top + 12
    for i, tl in enumerate(node["_title_lines"][:3]):
        svg.append(
            f'<text x="{x + 12:.1f}" y="{text_y + i * line_h:.1f}" '
            f'font-size="{title_font}" font-weight="700" fill="#111827" '
            'font-family="Arial, DejaVu Sans, sans-serif">'
            f'{esc(tl)}</text>'
        )

    route_y = y + h - 12
    svg.append(
        f'<text x="{x + 12:.1f}" y="{route_y:.1f}" '
        f'font-size="{route_font}" fill="#475569" '
        'font-family="Arial, DejaVu Sans, sans-serif">'
        f'{esc(node["route"])}</text>'
    )

svg.append('</svg>')

svg_path = OUT_DIR / 'interface_structure_screens.svg'
svg_path.write_text('\n'.join(svg), encoding='utf-8')
print(svg_path)
