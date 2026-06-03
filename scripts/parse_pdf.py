#!/usr/bin/env python3
import os
import sys
import json
import hashlib

try:
    from pypdf import PdfReader
except ImportError:
    print("\x1b[31mError: El paquete 'pypdf' no está instalado.\x1b[0m")
    print("Por favor, instálalo ejecutando:")
    print("  \x1b[36mpip3 install pypdf\x1b[0m")
    sys.exit(1)

def parse_single_pdf(pdf_path, output_dir):
    if not os.path.exists(pdf_path):
        print(f"\x1b[31mError: El archivo {pdf_path} no existe.\x1b[0m")
        return False

    filename = os.path.basename(pdf_path)
    base_name, _ = os.path.splitext(filename)
    output_filename = f"{base_name}.json"
    output_path = os.path.join(output_dir, output_filename)

    print(f"Procesando: {filename}...")

    try:
        reader = PdfReader(pdf_path)
        pages_data = []

        for idx, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            pages_data.append({
                "pageNumber": idx + 1,
                "text": text
            })

        # Generar un hash MD5 basado en el nombre de archivo para tener un ID estable
        file_id_hash = hashlib.md5(filename.encode('utf-8')).hexdigest()
        file_id = f"unknown-exam-{file_id_hash}"

        data = {
            "id": file_id,
            "year": None,
            "type": "exam",
            "source": {
                "fileName": filename,
                "filePath": os.path.abspath(pdf_path)
            },
            "pageCount": len(reader.pages),
            "pages": pages_data
        }

        # Guardar archivo JSON estructurado
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        print(f"\x1b[32m✔ Exitoso: Guardado en {output_path}\x1b[0m")
        return True

    except Exception as e:
        print(f"\x1b[31m✖ Falló al procesar {filename}: {str(e)}\x1b[0m")
        return False

def main():
    # Obtener rutas del proyecto relativas al script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    workspace_dir = os.path.dirname(script_dir)
    
    guidelines_dir = os.path.join(workspace_dir, "docs", "guidelines")
    guidelines_json_dir = os.path.join(workspace_dir, "docs", "guidelines-json")

    # Asegurar que existan los directorios
    os.makedirs(guidelines_dir, exist_ok=True)
    os.makedirs(guidelines_json_dir, exist_ok=True)

    # Si se pasa un argumento, procesar ese PDF específico
    if len(sys.argv) > 1:
        pdf_target = sys.argv[1]
        parse_single_pdf(pdf_target, guidelines_json_dir)
    else:
        # Escanear recursivamente todos los PDFs en docs/guidelines/
        pdf_tasks = []
        for root, dirs, files in os.walk(guidelines_dir):
            for file in files:
                if file.lower().endswith('.pdf'):
                    pdf_path = os.path.join(root, file)
                    # Determinar subcarpeta relativa
                    rel_dir = os.path.relpath(root, guidelines_dir)
                    if rel_dir == ".":
                        target_out_dir = guidelines_json_dir
                    else:
                        target_out_dir = os.path.join(guidelines_json_dir, rel_dir)
                    
                    pdf_tasks.append((pdf_path, target_out_dir, file))
        
        if not pdf_tasks:
            print(f"No se encontraron archivos PDF en: {guidelines_dir}")
            print(f"Coloca tus libros o consensos PDF ahí y vuelve a ejecutar el script.")
            return

        print(f"Encontrados {len(pdf_tasks)} archivos PDF en total (incluyendo subcarpetas). Procesando pendientes...")
        processed = 0
        for pdf_path, target_out_dir, file in pdf_tasks:
            base_name, _ = os.path.splitext(file)
            os.makedirs(target_out_dir, exist_ok=True)
            output_json = os.path.join(target_out_dir, f"{base_name}.json")
            
            # Solo procesa si no existe el JSON ya generado
            if not os.path.exists(output_json):
                if parse_single_pdf(pdf_path, target_out_dir):
                    processed += 1
            else:
                # Mostrar mensaje de omisión en gris/atenuado para no llenar la consola si hay cientos de archivos
                pass
                
        print(f"\nProceso terminado. Se procesaron {processed} nuevos archivos PDF.")

if __name__ == "__main__":
    main()
