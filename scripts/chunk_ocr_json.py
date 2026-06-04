#!/usr/bin/env python3
import os
import sys
import json
import hashlib
import unicodedata
import re

ENGLISH_KEYWORDS = [
    'exercise physiology', 'sports medicine', 'therapeutic exercise', 'obesity', 'fat mass', 'weight loss',
    'strength', 'hypertrophy', 'resistance training', 'muscle', 'aerobic', 'endurance', 'cardio', 'running',
    'cycling', 'diabetes', 'diabetic', 'glycemic', 'glucose', 'cardiovascular', 'cardiopulmonary', 'heart',
    'renal', 'pulmonary', 'pain', 'injury', 'rehabilitation', 'prevention', 'geriatrics', 'osteoporosis',
    'medical frailty', 'young athlete', 'pediatric', 'adolescent', 'immature', 'bone', 'hypertension',
    'low back', 'spine', 'neck', 'knee', 'patella', 'patellofemoral', 'shoulder', 'glenohumeral', 'rotator cuff'
]

SPANISH_PORTUGUESE_MAP = {
    'fisiologia do exercicio': 'exercise physiology',
    'fisiologia del ejercicio': 'exercise physiology',
    'medicina do esporte': 'sports medicine',
    'medicina del deporte': 'sports medicine',
    'exercicio terapeutico': 'therapeutic exercise',
    'ejercicio terapeutico': 'therapeutic exercise',
    'obesidade': 'obesity',
    'obesidad': 'obesity',
    'perda de peso': 'weight loss',
    'perdida de peso': 'weight loss',
    'forca': 'strength',
    'fuerza': 'strength',
    'hipertrofia': 'hypertrophy',
    'treinamento de resistencia': 'resistance training',
    'entrenamiento de resistencia': 'resistance training',
    'musculo': 'muscle',
    'aerobico': 'aerobic',
    'resistencia': 'endurance',
    'corrida': 'running',
    'correr': 'running',
    'ciclismo': 'cycling',
    'diabetes': 'diabetes',
    'diabetico': 'diabetic',
    'glicemico': 'glycemic',
    'glucemico': 'glycemic',
    'glicose': 'glucose',
    'glucosa': 'glucose',
    'cardiovascular': 'cardiovascular',
    'cardiopulmonar': 'cardiopulmonary',
    'coracao': 'heart',
    'corazon': 'heart',
    'renal': 'renal',
    'pulmonar': 'pulmonary',
    'dor': 'pain',
    'dolor': 'pain',
    'lesao': 'injury',
    'lesion': 'injury',
    'reabilitacao': 'rehabilitation',
    'rehabilitacion': 'rehabilitation',
    'prevencao': 'prevention',
    'prevencion': 'prevention',
    'geriatria': 'geriatrics',
    'geriatric': 'geriatrics',
    'osteoporose': 'osteoporosis',
    'osteoporosis': 'osteoporosis',
    'fragilidade': 'medical frailty',
    'fragilidad': 'medical frailty',
    'atleta jovem': 'young athlete',
    'pediatrico': 'pediatric',
    'adolescente': 'adolescent',
    'imatura': 'immature',
    'impaturo': 'immature',
    'osso': 'bone',
    'hueso': 'bone',
    'hipertensao': 'hypertension',
    'hipertension': 'hypertension',
    'lombar': 'low back',
    'lumbar': 'low back',
    'coluna': 'spine',
    'columna': 'spine',
    'pescoco': 'neck',
    'cuello': 'neck',
    'joelho': 'knee',
    'rodilla': 'knee',
    'patela': 'patella',
    'rotula': 'patella',
    'patelofemoral': 'patellofemoral',
    'ombro': 'shoulder',
    'hombro': 'shoulder',
    'glenoumeral': 'glenohumeral',
    'glenohumeral': 'glenohumeral',
    'manguito rotador': 'rotator cuff'
}

def normalize_text(text):
    if not text:
        return ""
    text = text.lower()
    text = "".join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')
    text = re.sub(r'\s+', ' ', text)
    return text

def extract_keywords_from_text(raw_text):
    norm_text = normalize_text(raw_text)
    matched = set()

    for kw in ENGLISH_KEYWORDS:
        norm_kw = normalize_text(kw)
        if norm_kw in norm_text:
            matched.add(kw)

    for term, eng_kw in SPANISH_PORTUGUESE_MAP.items():
        if term in norm_text:
            matched.add(eng_kw)

    return sorted(list(matched))

def chunk_json(ocr_json_path, original_pdf_name, output_dir, chunk_size=8):
    if not os.path.exists(ocr_json_path):
        print(f"Error: {ocr_json_path} does not exist.")
        return False

    base_name, _ = os.path.splitext(original_pdf_name)
    print(f"\nChunking OCR JSON for: {original_pdf_name}...")

    try:
        with open(ocr_json_path, 'r', encoding='utf-8') as f:
            ocr_data = json.load(f)

        pages = ocr_data.get("pages", [])
        total_pages = len(pages)
        print(f"Total pages: {total_pages}")

        if total_pages <= 12:
            chunk_ranges = [(0, total_pages)]
        else:
            chunk_ranges = []
            for start in range(0, total_pages, chunk_size):
                end = min(start + chunk_size, total_pages)
                chunk_ranges.append((start, end))

        file_id_hash = hashlib.md5(original_pdf_name.encode('utf-8')).hexdigest()

        for idx, (start, end) in enumerate(chunk_ranges):
            chunk_pages = pages[start:end]
            chunk_raw_text = ""
            for p in chunk_pages:
                chunk_raw_text += "\n" + (p.get("text") or "")

            chunk_keywords = extract_keywords_from_text(chunk_raw_text)
            chunk_filename_display = f"{base_name} - Chunk {idx + 1} (Pages {start + 1}-{end}).pdf"
            chunk_id = f"unknown-exam-{file_id_hash}-chunk-{idx}"

            chunk_doc = {
                "id": chunk_id,
                "year": None,
                "type": "exam",
                "source": {
                    "fileName": chunk_filename_display,
                    "originalFileName": original_pdf_name,
                    "filePath": os.path.abspath(os.path.join("docs", "guidelines", original_pdf_name))
                },
                "pageCount": len(chunk_pages),
                "pages": chunk_pages,
                "keywords": chunk_keywords
            }

            chunk_out_filename = f"{base_name}_chunk_{idx}.json"
            chunk_out_path = os.path.join(output_dir, chunk_out_filename)

            with open(chunk_out_path, 'w', encoding='utf-8') as out_f:
                json.dump(chunk_doc, out_f, ensure_ascii=False, indent=2)

        print(f"✔ Successfully saved {len(chunk_ranges)} chunks in {output_dir}")
        return True

    except Exception as e:
        print(f"✖ Failed chunking: {str(e)}")
        return False

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    workspace_dir = os.path.dirname(script_dir)
    
    guidelines_json_dir = os.path.join(workspace_dir, "docs", "guidelines-json")
    os.makedirs(guidelines_json_dir, exist_ok=True)

    # Chunk ACSM Guidelines
    chunk_json(
        os.path.join(workspace_dir, "docs", "guidelines", "ACSM_ocr_text.json"),
        "ACSM'S Guidelines for Exercise Testing and Prescription 11th Edition PDF.pdf",
        guidelines_json_dir
    )

    # Chunk Fundamentos
    chunk_json(
        os.path.join(workspace_dir, "docs", "guidelines", "Fundamentos_ocr_text.json"),
        "FUNDAMENTOS-DE-FISIOLOGIA-DO-EXERCÍCIO.pdf",
        guidelines_json_dir
    )

if __name__ == "__main__":
    main()
