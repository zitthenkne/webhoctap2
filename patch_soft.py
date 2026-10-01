import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Make the layout more compact (max-w-3xl -> max-w-2xl)
content = content.replace('max-w-3xl', 'max-w-2xl')

# Soften the shadows and brutalist edges
content = content.replace('box-shadow: 4px 6px 0px rgba(255, 194, 209, 0.4);', 'box-shadow: 0 12px 24px -8px rgba(255, 194, 209, 0.5);')
content = content.replace('box-shadow: 6px 10px 0px rgba(255, 194, 209, 0.5);', 'box-shadow: 0 16px 32px -8px rgba(255, 194, 209, 0.6);')
content = content.replace('box-shadow: 0 4px 0 #fb6f92;', 'box-shadow: 0 8px 20px -6px #fb6f92;')
content = content.replace('box-shadow: 0 0 0 #fb6f92;', '')
content = content.replace('box-shadow: 3px 3px 0 #ffc2d1;', 'box-shadow: 0 8px 16px -4px #ffc2d1;')
content = content.replace('box-shadow: 0 0 0 2px #ffc2d1, 2px 4px 0 rgba(255, 194, 209, 0.4);', 'box-shadow: 0 0 0 2px #ffc2d1, 0 6px 12px rgba(255, 194, 209, 0.4);')
content = content.replace('box-shadow: 2px 2px 0 #ffc2d1;', 'box-shadow: 0 4px 8px -2px #ffc2d1;')
content = content.replace('transform: translateY(4px);', 'transform: translateY(2px);')

# Make borders a bit softer if possible, or just keep them but rely on shadows for softness.

# Change wording to be more professional but keep the pastel aesthetic
content = content.replace('Lên chiến lược lấy học bổng dễ thương nà 🎀', 'Công cụ tính điểm và lập chiến lược học tập')
content = content.replace('Quy Đổi Nhanh Xíu', 'Quy Đổi Điểm Nhanh')
content = content.replace('Số câu đúng nà', 'Số câu đúng')
content = content.replace('Tổng số câu thi', 'Tổng số câu')
content = content.replace('Gợi ý lẹ:', 'Gợi ý nhanh:')
content = content.replace('Bảng quy đổi chuẩn UMP nè', 'Bảng quy đổi điểm UMP')
content = content.replace('Lên kế hoạch cày số câu đúng.', 'Lập kế hoạch phân bổ số câu đúng.')
content = content.replace('Môn học đang cày', 'Môn học đang theo dõi')
content = content.replace('Chọn cấu trúc kỳ thi nghen', 'Cấu trúc đợt thi')
content = content.replace('Mục tiêu điểm số của bà', 'Mục tiêu điểm số')
content = content.replace('Ghi chú lại đợt thi nà', 'Thông tin các đợt thi')
content = content.replace('Xong goày! Tính Ngay!', 'Phân Tích Chiến Lược')
content = content.replace('🧸', '<i class="fas fa-stethoscope text-3xl text-[#ff8fab]"></i>') # Swap emoji for a professional icon colored pastel

# Adjust icon/washi tape colors or sizes if needed to make it softer
content = content.replace('text-4xl font-extrabold text-[#4a4e69] font-handwriting', 'text-3xl font-bold text-[#4a4e69] font-handwriting')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("Successfully softened the UI and made language professional")
