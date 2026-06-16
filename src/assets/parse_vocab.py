import re, sys, os

# Read input file from argument
input_path = sys.argv[1]

with open(input_path, 'r', encoding='utf-8') as f:
    text = f.read()

lines = text.split('\n')
lines = [l.strip() for l in lines]

entries = []
current_unit = None
buffer = []

def flush_buffer(buf, unit):
    if not buf:
        return None
    merged = ' '.join(buf)

    phonetics = re.findall(r'/([^/]+)/', merged)
    if not phonetics:
        return None

    main_phonetic = phonetics[0]

    parts = re.split(r'/[^/]+/', merged, maxsplit=1)
    word_part = parts[0].strip() if parts else ''
    after = parts[1].strip() if len(parts) > 1 else ''

    word = re.sub(r'p\.\d+', '', word_part).strip()
    word = re.sub(r'\s+(adj\.|adv\.|n\.|v\.|prep\.|pron\.)$', '', word)

    meaning = re.sub(r'p\.\d+', '', after).strip()

    chinese_match = re.search(r'[一-鿿]+', meaning)
    if chinese_match:
        first_chinese_idx = chinese_match.start()
        before_chinese = meaning[:first_chinese_idx].strip()
        chinese_part = meaning[first_chinese_idx:].strip()

        if before_chinese and not re.match(r'^(adj\.|adv\.|n\.|v\.|prep\.|pron\.|&|and)', before_chinese):
            word = word + ' ' + before_chinese

        meaning = chinese_part
    else:
        meaning = re.sub(r'^(adj\.|adv\.|n\.|v\.|prep\.|pron\.|&|and)\s*', '', meaning).strip()

    meaning = re.sub(r'^\s*[;;，,]\s*', '', meaning)
    meaning = re.sub(r'\s+', ' ', meaning).strip()
    meaning = re.sub(r'\s+(adj\.|adv\.|n\.|v\.|prep\.|pron\.|&|and)$', '', meaning)
    meaning = re.sub(r'\s+', ' ', meaning).strip()

    if not word:
        return None
    if re.match(r'^(adj\.|adv\.|n\.|v\.|prep\.|pron\.|&|and)$', word, re.IGNORECASE):
        return None
    if re.match(r'^p\.\d+$', word):
        return None

    return (unit, word, main_phonetic, meaning)

standalone_entries = []
in_unit = False

for line in lines:
    if not line:
        continue
    um = re.match(r'^Unit\s+(\d+)$', line, re.IGNORECASE)
    if um:
        if buffer:
            result = flush_buffer(buffer, current_unit)
            if result:
                standalone_entries.append(result)
            buffer = []
        current_unit = int(um.group(1))
        in_unit = True
        continue
    if not in_unit:
        continue
    if 'Vocabulary in Each Unit' in line or re.match(r'^\d+$', line):
        continue
    if line.startswith('（注'):
        continue

    if '/' in line:
        if buffer:
            result = flush_buffer(buffer, current_unit)
            if result:
                standalone_entries.append(result)
            buffer = []
        buffer.append(line)
    else:
        if buffer:
            buffer.append(line)

if buffer:
    result = flush_buffer(buffer, current_unit)
    if result:
        standalone_entries.append(result)

seen_words = set()
cleaned = []
for unit, word, phonetic, meaning in standalone_entries:
    w = word.strip()
    if not w or len(w) > 80:
        continue
    if re.match(r'^p\.\d+$', w):
        continue
    if w.startswith('v.') or w.startswith('adj.') or w.startswith('n.'):
        continue
    if meaning.startswith(')') or meaning.startswith(','):
        continue

    key = f"{unit}|{w.lower()}"
    if key in seen_words:
        continue
    seen_words.add(key)

    w = re.sub(r'\s+', ' ', w).strip()
    meaning = re.sub(r'\s+', ' ', meaning).strip()

    cleaned.append((unit, w, phonetic, meaning))

sys.stdout.reconfigure(encoding='utf-8')
sys.stdout.write('﻿')
print("grade_unit,word,phonetic,meaning,example_sentence")
for unit, word, phonetic, meaning in cleaned:
    word_esc = word.replace('"', '""')
    phonetic_esc = phonetic.replace('"', '""')
    meaning_esc = meaning.replace('"', '""')
    print(f'8AU{unit},"{word_esc}","/{phonetic_esc}/","{meaning_esc}",')
