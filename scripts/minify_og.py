"""
minify.py — strip comments and blank lines from a Lua script.
Usage: python minify.py <input.lua> <output.lua>
       python minify.py serpentineSeqr/serpentine_dev.lua serpentine_v1-3.lua
"""
import re, io, sys

def minify(src, dst):
    with io.open(src, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    out = []
    for line in lines:
        stripped = line.rstrip()
        # skip pure comment lines
        if re.match(r'^\s*--', stripped):
            continue
        # skip blank lines
        if stripped == '':
            continue
        # strip inline comments (not inside strings)
        result = ''
        i = 0
        in_str = None
        while i < len(stripped):
            c = stripped[i]
            if in_str:
                result += c
                if c == in_str:
                    in_str = None
            elif c in ('"', "'"):
                in_str = c
                result += c
            elif c == '-' and i + 1 < len(stripped) and stripped[i + 1] == '-':
                break
            else:
                result += c
            i += 1
        result = result.rstrip()
        if result:
            out.append(result + '\n')

    # Warn on Lua 5.3+ syntax that crashes Lua 5.1 (Pico)
    lua51_patterns = [
        (r'(?<![=~<>])(>>|<<)(?!=)', 'bitwise shift (>> or <<)'),
        (r'(?<![=~<>!])&(?![=&])',    'bitwise AND (&)'),
        (r'(?<![=~<>!])\|(?![=|])',   'bitwise OR (|)'),
        (r'~(?![=])',                  'bitwise NOT/XOR (~)'),
        (r'\bgoto\b',                  'goto statement'),
        (r'::',                        'goto label (::)'),
    ]
    warned = False
    for i, line in enumerate(out, 1):
        for pattern, desc in lua51_patterns:
            if re.search(pattern, line):
                print(f'  WARNING line {i}: {desc} -- not valid Lua 5.1')
                warned = True
                break

    with io.open(dst, 'w', encoding='utf-8') as f:
        f.writelines(out)

    status = ' (warnings above)' if warned else ' OK'
    print(f'{src} -> {dst}  ({len(lines)} lines -> {len(out)} lines){status}')

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print('Usage: python minify.py <input.lua> <output.lua>')
        sys.exit(1)
    minify(sys.argv[1], sys.argv[2])
