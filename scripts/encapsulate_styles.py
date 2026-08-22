import re

def rewrite_contact_css():
    with open('contact.html', 'r', encoding='utf-8') as f:
        html = f.read()
    
    # Extract style block from original contact.html
    match = re.search(r'<style>(.*?)</style>', html, re.DOTALL)
    if not match:
        print("Style not found in contact.html")
        return
    
    raw_css = match.group(1).strip()
    
    # Replace :root with .contact-page-root
    css = re.sub(r':root\s*\{', '.contact-page-root {', raw_css)
    
    # Replace html, body or body rules with .contact-page-root rules
    css = re.sub(r'html\s*\{[^}]*\}', '', css)
    css = re.sub(r'body\s*\{([^}]*)\}', r'.contact-page-root {\1}', css)
    
    # Prefix all other selectors with .contact-page-root
    lines = css.splitlines()
    out = []
    in_keyframes = False
    
    for line in lines:
        stripped = line.strip()
        if not stripped:
            out.append(line)
            continue
        if stripped.startswith('@import') or stripped.startswith('@keyframes') or '@keyframes' in stripped:
            if '@keyframes' in stripped:
                in_keyframes = True
            out.append(line)
            continue
        if in_keyframes:
            out.append(line)
            if stripped == '}':
                in_keyframes = False
            continue
        if stripped.startswith('.contact-page-root'):
            out.append(line)
            continue
        if '{' in line and not stripped.startswith('@media') and not stripped.startswith('/*') and not stripped.startswith('from') and not stripped.startswith('to') and not re.match(r'^\d+%', stripped):
            parts = line.split('{')
            selectors = parts[0].split(',')
            scoped = []
            for sel in selectors:
                s = sel.strip()
                if s:
                    scoped.append(f".contact-page-root {s}")
                else:
                    scoped.append(sel)
            out.append(','.join(scoped) + '{' + '{'.join(parts[1:]))
        else:
            out.append(line)
            
    with open('frontend/src/styles/contact.css', 'w', encoding='utf-8') as f:
        f.write('\n'.join(out))
    print("contact.css completely encapsulated under .contact-page-root.")

def rewrite_landing_css():
    with open('index.html', 'r', encoding='utf-8') as f:
        html = f.read()
    
    match = re.search(r'<style>(.*?)</style>', html, re.DOTALL)
    if not match:
        print("Style not found in index.html")
        return
    
    raw_css = match.group(1).strip()
    
    css = re.sub(r':root\s*\{', '.landing-page-root {', raw_css)
    css = re.sub(r'html\s*\{[^}]*\}', '', css)
    css = re.sub(r'body\s*\{([^}]*)\}', r'.landing-page-root {\1}', css)
    
    lines = css.splitlines()
    out = []
    in_keyframes = False
    
    for line in lines:
        stripped = line.strip()
        if not stripped:
            out.append(line)
            continue
        if stripped.startswith('@import') or stripped.startswith('@keyframes') or '@keyframes' in stripped:
            if '@keyframes' in stripped:
                in_keyframes = True
            out.append(line)
            continue
        if in_keyframes:
            out.append(line)
            if stripped == '}':
                in_keyframes = False
            continue
        if stripped.startswith('.landing-page-root'):
            out.append(line)
            continue
        if '{' in line and not stripped.startswith('@media') and not stripped.startswith('/*') and not stripped.startswith('from') and not stripped.startswith('to') and not re.match(r'^\d+%', stripped):
            parts = line.split('{')
            selectors = parts[0].split(',')
            scoped = []
            for sel in selectors:
                s = sel.strip()
                if s:
                    scoped.append(f".landing-page-root {s}")
                else:
                    scoped.append(sel)
            out.append(','.join(scoped) + '{' + '{'.join(parts[1:]))
        else:
            out.append(line)
            
    with open('frontend/src/styles/landing.css', 'w', encoding='utf-8') as f:
        f.write('\n'.join(out))
    print("landing.css completely encapsulated under .landing-page-root.")

if __name__ == '__main__':
    rewrite_contact_css()
    rewrite_landing_css()
