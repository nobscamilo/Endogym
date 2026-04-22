from pathlib import Path
import subprocess
from PIL import Image, ImageEnhance, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ANATOMY = ROOT / 'public' / 'anatomy'
SOURCE = ANATOMY / 'vendor' / 'muscles-front-and-back.svg'
OUT = ANATOMY / 'vector-layers'
BASE = ANATOMY / 'vector-muscles-base.png'
WIDTH = 1600
HEIGHT = 1394

# These IDs are selected from the source SVG paths. The SVG paths themselves are
# anatomical vector regions; the generated PNGs are alpha masks aligned to the
# rendered atlas, not hand-drawn React overlays.
REGION_PATH_IDS = {
    'front': {
        'front_shoulders': ['path879'],
        'chest': ['path847', 'path950'],
        'biceps': ['path881', 'path968'],
        'forearms': ['path908', 'path998', 'path1065', 'path1080'],
        'abs': ['path1100', 'path970', 'path974', 'path978'],
        'obliques': ['path1109', 'path1803', 'path928', 'path948'],
        'quadriceps': ['path1554', 'path1366', 'path1440', 'path1337', 'path1307'],
        'adductors': ['path1012', 'path1411', 'path1504', 'path1508'],
        'calves': ['path1790', 'path1887', 'path1848', 'path1734', 'path1714', 'path1963', 'path1983'],
    },
    'back': {
        'rear_shoulders': ['path1452', 'path1432', 'path2085', 'path2163'],
        'upper_back': ['path1268', 'path1919', 'path1955'],
        'lats': ['path3733', 'path2220'],
        'triceps': ['path1513', 'path1542', 'path1556', 'path1648'],
        'lower_back': ['path1867'],
        'glutes': ['path2744'],
        'hamstrings': ['path2931', 'path2803', 'path2990', 'path2900', 'path2962'],
        'calves': ['path3075', 'path3022', 'path3196', 'path3216', 'path3254', 'path3288', 'path3268', 'path3355'],
    },
}


def run_rsvg(svg_text, output):
    temp_svg = OUT / '_temp-render.svg'
    temp_svg.write_text(svg_text, encoding='utf-8')
    subprocess.run(
        ['rsvg-convert', '-w', str(WIDTH), str(temp_svg), '-o', str(output)],
        check=True,
        stdout=subprocess.DEVNULL,
    )
    temp_svg.unlink(missing_ok=True)


def generate_base(source_text):
    temp = OUT / '_base-color.png'
    run_rsvg(source_text, temp)
    image = Image.open(temp).convert('RGBA')
    alpha = image.getchannel('A')
    gray = ImageOps.grayscale(image)
    gray = ImageEnhance.Contrast(gray).enhance(1.08)
    gray = ImageEnhance.Brightness(gray).enhance(1.1)
    base = ImageOps.colorize(gray, black='#253140', white='#f7fafc').convert('RGBA')
    base.putalpha(alpha)
    base.save(BASE, optimize=True)
    temp.unlink(missing_ok=True)


def mask_style(path_ids):
    selectors = ','.join(f'#{path_id}' for path_id in path_ids)
    return f'''<style xmlns="http://www.w3.org/2000/svg"><![CDATA[
path,use,rect,ellipse,circle,polygon,polyline {{
  fill: transparent !important;
  stroke: transparent !important;
}}
{selectors} {{
  fill: #ffffff !important;
  stroke: #ffffff !important;
  stroke-width: 0.4 !important;
  opacity: 1 !important;
  display: inline !important;
}}
]]></style>'''


def generate_mask(source_text, view, region, path_ids):
    rendered = OUT / f'_{view}-{region}-render.png'
    styled_svg = source_text.replace('</svg>', f'{mask_style(path_ids)}</svg>')
    run_rsvg(styled_svg, rendered)
    image = Image.open(rendered).convert('RGBA')
    alpha = image.getchannel('A')
    layer = Image.new('RGBA', image.size, (255, 255, 255, 0))
    layer.putalpha(alpha)
    output = OUT / f'{view}-{region}.png'
    layer.save(output, optimize=True)
    rendered.unlink(missing_ok=True)
    return output


def main():
    if not SOURCE.exists():
        raise SystemExit(f'Missing source SVG: {SOURCE}')
    OUT.mkdir(parents=True, exist_ok=True)
    for stale in OUT.glob('*.png'):
        stale.unlink()
    source_text = SOURCE.read_text(encoding='utf-8', errors='ignore')
    generate_base(source_text)
    generated = [BASE]
    for view, regions in REGION_PATH_IDS.items():
        for region, path_ids in regions.items():
            generated.append(generate_mask(source_text, view, region, path_ids))
    for path in generated:
        print(path.relative_to(ROOT))


if __name__ == '__main__':
    main()
