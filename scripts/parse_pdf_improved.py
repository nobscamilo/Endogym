#!/usr/bin/env python3
import os
import sys
import json
import hashlib
import unicodedata
import re

try:
    from pypdf import PdfReader
except ImportError:
    print("\x1b[31mError: El paquete 'pypdf' no está instalado.\x1b[0m")
    print("Por favor, instálalo ejecutando:")
    print("  \x1b[36mpip3 install pypdf\x1b[0m")
    sys.exit(1)

# Lista completa de palabras clave derivadas del Coach AI (en inglés)
ENGLISH_KEYWORDS = [
    'exercise physiology', 'sports medicine', 'therapeutic exercise', 'obesity', 'fat mass', 'weight loss',
    'strength', 'hypertrophy', 'resistance training', 'muscle', 'aerobic', 'endurance', 'cardio', 'running',
    'cycling', 'diabetes', 'diabetic', 'glycemic', 'glucose', 'cardiovascular', 'cardiopulmonary', 'heart',
    'renal', 'pulmonary', 'pain', 'injury', 'rehabilitation', 'prevention', 'geriatrics', 'osteoporosis',
    'medical frailty', 'young athlete', 'pediatric', 'adolescent', 'immature', 'bone', 'hypertension',
    'low back', 'spine', 'neck', 'knee', 'patella', 'patellofemoral', 'shoulder', 'glenohumeral', 'rotator cuff'
]

# Diccionario de mapeo de español y portugués a la palabra clave en inglés correspondiente
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
    # Eliminar acentos y diacríticos
    text = "".join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')
    # Reemplazar múltiples espacios/saltos de línea con un solo espacio
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

def parse_and_chunk_pdf(pdf_path, output_dir, chunk_size=8):
    if not os.path.exists(pdf_path):
        print(f"\x1b[31mError: El archivo {pdf_path} no existe.\x1b[0m")
        return False

    filename = os.path.basename(pdf_path)
    base_name, _ = os.path.splitext(filename)
    
    print(f"\nProcesando libro: {filename}...")

    try:
        reader = PdfReader(pdf_path)
        total_pages = len(reader.pages)
        print(f"Total páginas encontradas: {total_pages}")

        # Decidir si fragmentamos o lo dejamos como un solo bloque
        if total_pages <= 12:
            chunk_ranges = [(0, total_pages)]
            print("Archivo pequeño (<= 12 páginas). No se fragmentará.")
        else:
            chunk_ranges = []
            for start in range(0, total_pages, chunk_size):
                end = min(start + chunk_size, total_pages)
                chunk_ranges.append((start, end))
            print(f"Fragmentando en {len(chunk_ranges)} bloques de {chunk_size} páginas cada uno.")

        file_id_hash = hashlib.md5(filename.encode('utf-8')).hexdigest()

        for idx, (start, end) in enumerate(chunk_ranges):
            pages_data = []
            chunk_raw_text = ""

            for p_idx in range(start, end):
                page = reader.pages[p_idx]
                text = page.extract_text() or ""
                pages_data.append({
                    "pageNumber": p_idx + 1,
                    "text": text
                })
                chunk_raw_text += "\n" + text

            # Extraer palabras clave de este bloque
            chunk_keywords = extract_keywords_from_text(chunk_raw_text)

            # Nombre de archivo específico para este chunk
            chunk_filename_display = f"{base_name} - Chunk {idx + 1} (Pages {start + 1}-{end}).pdf"
            chunk_id = f"unknown-exam-{file_id_hash}-chunk-{idx}"

            chunk_doc = {
                "id": chunk_id,
                "year": None,
                "type": "exam",
                "source": {
                    "fileName": chunk_filename_display,
                    "originalFileName": filename,
                    "filePath": os.path.abspath(pdf_path)
                },
                "pageCount": len(pages_data),
                "pages": pages_data,
                "keywords": chunk_keywords
            }

            # Guardar JSON
            chunk_out_filename = f"{base_name}_chunk_{idx}.json"
            chunk_out_path = os.path.join(output_dir, chunk_out_filename)

            with open(chunk_out_path, 'w', encoding='utf-8') as f:
                json.dump(chunk_doc, f, ensure_ascii=False, indent=2)

        print(f"\x1b[32m✔ Exitoso: {len(chunk_ranges)} bloques JSON guardados en {output_dir}\x1b[0m")
        return True

    except Exception as e:
        print(f"\x1b[31m✖ Falló al procesar {filename}: {str(e)}\x1b[0m")
        import traceback
        traceback.print_exc()
        return False

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    workspace_dir = os.path.dirname(script_dir)
    
    guidelines_dir = os.path.join(workspace_dir, "docs", "guidelines")
    guidelines_json_dir = os.path.join(workspace_dir, "docs", "guidelines-json")

    os.makedirs(guidelines_dir, exist_ok=True)
    os.makedirs(guidelines_json_dir, exist_ok=True)

    if len(sys.argv) > 1:
        pdf_target = sys.argv[1]
        parse_and_chunk_pdf(pdf_target, guidelines_json_dir)
    else:
        # Procesar todos los archivos PDF en docs/guidelines/ que no tengan un JSON correspondiente
        pdf_tasks = []
        for root, dirs, files in os.walk(guidelines_dir):
            for file in files:
                if file.lower().endswith('.pdf'):
                    pdf_path = os.path.join(root, file)
                    rel_dir = os.path.relpath(root, guidelines_dir)
                    if rel_dir == ".":
                        target_out_dir = guidelines_json_dir
                    else:
                        target_out_dir = os.path.join(guidelines_json_dir, rel_dir)
                    
                    pdf_tasks.append((pdf_path, target_out_dir, file))
        
        if not pdf_tasks:
            print(f"No se encontraron archivos PDF en: {guidelines_dir}")
            return

        print(f"Encontrados {len(pdf_tasks)} archivos PDF en total. Buscando pendientes de fragmentación...")
        processed = 0
        for pdf_path, target_out_dir, file in pdf_tasks:
            base_name, _ = os.path.splitext(file)
            os.makedirs(target_out_dir, exist_ok=True)
            
            # Comprobar si ya existe algún chunk JSON para este archivo
            # Si el archivo original se fragmenta, buscará si existe chunk_0
            expected_json_chunk_0 = os.path.join(target_out_dir, f"{base_name}_chunk_0.json")
            expected_json_single = os.path.join(target_out_dir, f"{base_name}.json")
            
            if not os.path.exists(expected_json_chunk_0) and not os.path.exists(expected_json_single):
                if parse_and_chunk_pdf(pdf_path, target_out_dir):
                    processed += 1
            else:
                # Omitir si ya está procesado
                pass
                
        print(f"\nProceso terminado. Se procesaron {processed} nuevos libros PDF.")

if __name__ == "__main__":
    main()
