#!/usr/bin/env python3
"""
build-gem.py — Compilador y validador de Gemini Gems para gem-studio.
Ensambla entradas modulares (YAML + Markdown) bajo la estructura requerida
por GemConfigurationSchema y emite un archivo JSON compilado.
"""

import json
import sys
from pathlib import Path
import yaml
from jsonschema import validate, ValidationError

def build_gem(gem_dir_path: str, schema_path: str = "schemas/gem-configuration.schema.json") -> Path:
    gem_dir = Path(gem_dir_path).resolve()
    schema_file = Path(schema_path).resolve()

    if not gem_dir.is_dir():
        print(f"[ERROR] El directorio especificado no existe: {gem_dir}")
        sys.exit(1)

    meta_file = gem_dir / "meta.yaml"
    instructions_file = gem_dir / "instructions.md"
    tone_file = gem_dir / "tone-and-style.md"

    if not meta_file.exists():
        print(f"[ERROR] Falta 'meta.yaml' en {gem_dir}")
        sys.exit(1)

    if not instructions_file.exists():
        print(f"[ERROR] Falta 'instructions.md' en {gem_dir}")
        sys.exit(1)

    # 1. Parsear archivo base de metadatos
    with open(meta_file, "r", encoding="utf-8") as f:
        gem_data = yaml.safe_load(f) or {}

    # 2. Inyectar comportamiento desde archivos Markdown
    if "behavior" not in gem_data:
        gem_data["behavior"] = {}

    with open(instructions_file, "r", encoding="utf-8") as f:
        base_instructions = f.read().strip()

    if tone_file.exists():
        with open(tone_file, "r", encoding="utf-8") as f:
            gem_data["behavior"]["tone_and_style"] = f.read().strip()

    # 3. Concatenar tone_and_style en instructions para inyección efectiva en la UI
    tone_and_style = gem_data["behavior"].get("tone_and_style", "").strip()
    if tone_and_style:
        gem_data["behavior"]["instructions"] = (
            f"{base_instructions}\n\n---\n\n### TONO Y ESTILO OPERATIVO\n{tone_and_style}"
        )
    else:
        gem_data["behavior"]["instructions"] = base_instructions

    # 4. Empaquetar bajo el nodo raíz exigido por el schema
    payload = {"gem_configuration": gem_data}

    # 5. Validar contra GemConfigurationSchema
    if not schema_file.exists():
        print(f"[ERROR] No se encontró el esquema en: {schema_file}")
        sys.exit(1)

    with open(schema_file, "r", encoding="utf-8") as f:
        schema = json.load(f)

    try:
        validate(instance=payload, schema=schema)
        print(f"[VALIDACIÓN OK] '{gem_dir.name}' cumple estrictamente con GemConfigurationSchema.")
    except ValidationError as err:
        print(f"\n[ERROR DE VALIDACIÓN] En '{gem_dir.name}':")
        print(f" -> Mensaje: {err.message}")
        print(f" -> Ruta del campo: {' -> '.join([str(p) for p in err.absolute_path])}")
        sys.exit(1)

    # 6. Generar archivo JSON compilado en dist/
    dist_dir = Path("dist").resolve()
    dist_dir.mkdir(exist_ok=True)
    out_file = dist_dir / f"{gem_dir.name}.json"

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print(f"[BUILD EXITOSO] Artefacto generado en: {out_file}\n")
    return out_file

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python scripts/build-gem.py <ruta-del-gem> [ruta-del-schema]")
        print("Ejemplo: python scripts/build-gem.py gems/vault-distiller")
        sys.exit(1)

    target_dir = sys.argv[1]
    custom_schema = sys.argv[2] if len(sys.argv) > 2 else "schemas/gem-configuration.schema.json"
    build_gem(target_dir, custom_schema)
