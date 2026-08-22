import re

def scope_css(css_text, scope_class):
    lines = css_text.splitlines()
    output = []
    in_keyframes = False

    for line in lines:
        stripped = line.strip()
        
        if stripped.startswith('@import') or stripped.startswith('@keyframes') or '@keyframes' in stripped:
            if '@keyframes' in stripped:
                in_keyframes = True
            output.append(line)
            continue
            
        if in_keyframes:
            output.append(line)
            if stripped == '}':
                in_keyframes = False
            continue

        if stripped.startswith(':root'):
            output.append(line)
            continue

        # Replace html, body or body rules with scope_class
        if re.match(r'^(html,\s*body|body|html)\s*\{', stripped):
            new_line = re.sub(r'^(html,\s*body|body|html)', scope_class, line)
            output.append(new_line)
            continue

        # Check if line contains a CSS selector opening block '{'
        if '{' in line and not stripped.startswith('@media') and not stripped.startswith('/*') and not stripped.startswith('from') and not stripped.startswith('to') and not re.match(r'^\d+%', stripped):
            parts = line.split('{')
            selector_part = parts[0]
            rest = '{' + '{'.join(parts[1:])
            
            # Split comma separated selectors
            selectors = selector_part.split(',')
            scoped_selectors = []
            for sel in selectors:
                s = sel.strip()
                if s:
                    if s.startswith(scope_class):
                        scoped_selectors.append(sel)
                    elif s.startswith('*'):
                        scoped_selectors.append(f"{scope_class} {s}")
                    else:
                        scoped_selectors.append(f"{scope_class} {s}")
                else:
                    scoped_selectors.append(sel)
            
            output.append(','.join(scoped_selectors) + rest)
        else:
            output.append(line)

    return '\n'.join(output)

if __name__ == '__main__':
    with open('frontend/src/styles/app.css', 'r', encoding='utf-8') as f:
        app_css = f.read()
    scoped_app = scope_css(app_css, '.app-shell')
    with open('frontend/src/styles/app.css', 'w', encoding='utf-8') as f:
        f.write(scoped_app)

    print("Scoped app.css under .app-shell successfully.")
