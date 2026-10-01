with open('features/profile/stats-service.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace rose with pink to make it more kawaii
content = content.replace('bg-rose-50', 'bg-pink-50')
content = content.replace('text-rose-500', 'text-pink-500')
content = content.replace('text-rose-400', 'text-pink-400')
content = content.replace('text-rose-600', 'text-pink-600')
content = content.replace('border-rose-400', 'border-pink-400')

with open('features/profile/stats-service.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Successfully patched JS colors to pink")
