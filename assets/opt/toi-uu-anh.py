# -*- coding: utf-8 -*-
"""Sinh bản ảnh nhẹ (WebP) đúng cỡ hiển thị cho trang phòng đánh đề.

Vì sao: ảnh gốc trong assets/ để nguyên cỡ chụp (logo 611px/262KB,
squirrel_group 1024px/1231KB, nền pixel-art ~800KB mỗi tấm) trong khi trang chỉ
hiện logo ở 22px, sóc ở 74px, nền thì mờ 14%. Một lần mở phòng cũ tải ~2,4MB
ảnh; sau khi tối ưu còn ~100KB.

Chạy lại khi thêm/đổi ảnh nguồn:
    python assets/opt/toi-uu-anh.py

Ảnh GỐC được giữ nguyên (các trang khác vẫn dùng). Chỉ trang study-room trỏ
sang assets/opt/. Cần: pip install pillow
"""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.dirname(HERE)

# (nguồn, đích, cạnh dài tối đa, chất lượng)
VIEC = [
    ('logo.png', 'logo-96.webp', 96, 88),
    ('logo.png', 'logo-32.png', 32, None),          # favicon
    ('squirrel_group.png', 'squirrel_group-256.webp', 256, 85),
]
THU_MUC_NEN = [('bg quiz page', 'bg'), ('bg quiz page dark', 'bg-dark')]
CANH_NEN, CHAT_LUONG_NEN = 1600, 68


def ghi(src, dst, canh, chat_luong):
    im = Image.open(src)
    im.thumbnail((canh, canh), Image.LANCZOS)
    if chat_luong is None:
        im.save(dst, 'PNG', optimize=True)
    else:
        if im.mode not in ('RGB', 'RGBA'):
            im = im.convert('RGBA')
        im.save(dst, 'WEBP', quality=chat_luong, method=6)
    return os.path.getsize(src) / 1024, os.path.getsize(dst) / 1024


tong_a = tong_b = 0
for ten, ra, canh, q in VIEC:
    a, b = ghi(os.path.join(ASSETS, ten), os.path.join(HERE, ra), canh, q)
    tong_a += a
    tong_b += b
    print(f'{ra}: {a:.0f}KB -> {b:.0f}KB')

for thu_muc, ra in THU_MUC_NEN:
    dich = os.path.join(HERE, ra)
    os.makedirs(dich, exist_ok=True)
    nguon = os.path.join(ASSETS, thu_muc)
    for f in sorted(os.listdir(nguon)):
        if not f.lower().endswith(('.jpeg', '.jpg', '.png')):
            continue
        a, b = ghi(os.path.join(nguon, f), os.path.join(dich, os.path.splitext(f)[0] + '.webp'),
                   CANH_NEN, CHAT_LUONG_NEN)
        tong_a += a
        tong_b += b

print(f'Tong: {tong_a:.0f}KB -> {tong_b:.0f}KB')
