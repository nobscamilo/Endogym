#!/usr/bin/env python3
"""
Recalcula el campo `keywords` de todos los JSON ya parseados en docs/guidelines-json/
usando el vocabulario expandido de parse_pdf_improved.py (incluye nutrición).

No necesita los PDFs originales ni red: lee el texto que ya está guardado en cada JSON.
Es idempotente: reescribe el archivo solo si las keywords cambian. Tras correrlo, sube a
Firestore con `node scripts/upload_guidelines.js` (set por id, idempotente).

Uso:  python3 scripts/rekey_guidelines.py
"""
import os
import json
import sys

# Reutiliza la única fuente de verdad de extracción de keywords.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parse_pdf_improved import extract_keywords_from_text  # noqa: E402


def collect_text(doc):
    pages = doc.get('pages') or []
    parts = []
    for p in pages:
        if isinstance(p, dict) and p.get('text'):
            parts.append(p['text'])
    return "\n".join(parts)


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    workspace_dir = os.path.dirname(script_dir)
    json_dir = os.path.join(workspace_dir, 'docs', 'guidelines-json')

    if not os.path.isdir(json_dir):
        print(f"No existe el directorio: {json_dir}")
        sys.exit(1)

    total = 0
    changed = 0
    gained_nutrition = 0
    NUTRITION = {
        'nutrition', 'sports nutrition', 'protein', 'amino acid', 'protein synthesis', 'carbohydrate',
        'glycogen', 'dietary fat', 'hydration', 'fluid', 'electrolyte', 'sodium', 'micronutrient',
        'vitamin', 'mineral', 'iron', 'calcium', 'creatine', 'caffeine', 'nitrate', 'beta-alanine',
        'bicarbonate', 'supplement', 'ergogenic', 'energy availability', 'energy balance', 'calorie',
        'fiber', 'gastrointestinal', 'recovery',
    }

    for root, _dirs, files in os.walk(json_dir):
        for fname in files:
            if not fname.lower().endswith('.json'):
                continue
            fpath = os.path.join(root, fname)
            total += 1
            try:
                with open(fpath, 'r', encoding='utf-8') as f:
                    doc = json.load(f)
            except Exception as e:
                print(f"\x1b[31m✖ No se pudo leer {fname}: {e}\x1b[0m")
                continue

            old_kw = doc.get('keywords') or []
            text = collect_text(doc)
            new_kw = extract_keywords_from_text(text)

            had_nutrition = any(k in NUTRITION for k in old_kw)
            has_nutrition = any(k in NUTRITION for k in new_kw)

            if sorted(old_kw) != sorted(new_kw):
                doc['keywords'] = new_kw
                with open(fpath, 'w', encoding='utf-8') as f:
                    json.dump(doc, f, ensure_ascii=False, indent=2)
                changed += 1
                if has_nutrition and not had_nutrition:
                    gained_nutrition += 1

    print(f"\nProcesados: {total} | Reescritos: {changed} | Ganaron keywords de nutrición: {gained_nutrition}")
    print("Siguiente paso: node --env-file=.env.local scripts/upload_guidelines.js")


if __name__ == '__main__':
    main()
