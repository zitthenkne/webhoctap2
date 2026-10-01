import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the width issue (Tailwind arbitrary values don't work without JIT)
content = content.replace('max-w-[480px]', '')
content = content.replace('id="gpaCalculatorContent" class="content-panel hidden fade-in px-4 sm:px-6 pt-10 pb-28  mx-auto relative mt-4"', 'id="gpaCalculatorContent" class="content-panel hidden fade-in px-4 sm:px-6 pt-10 pb-28 mx-auto relative mt-4" style="max-width: 440px;"')
content = content.replace('id="gpaCalculatorContent" class="content-panel hidden fade-in px-4 sm:px-6 pt-10 pb-28 mx-auto relative mt-4"', 'id="gpaCalculatorContent" class="content-panel hidden fade-in px-4 sm:px-6 pt-10 pb-28 mx-auto relative mt-4" style="max-width: 440px;"')

# Ensure we catch it if there are multiple spaces
pattern_width = re.compile(r'<div id="gpaCalculatorContent" class="content-panel hidden fade-in px-4 sm:px-6 pt-10 pb-28(.*?)mx-auto relative mt-4">')
content = pattern_width.sub(r'<div id="gpaCalculatorContent" class="content-panel hidden fade-in px-4 sm:px-6 pt-10 pb-28 mx-auto relative mt-4" style="max-width: 440px;">', content)


# Remove the pink caro background
pattern_caro = re.compile(r'\s*<!-- Nền Caro Sổ Vở.*?</div>', re.DOTALL)
content = pattern_caro.sub('', content)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("Successfully fixed width and removed pink caro")
