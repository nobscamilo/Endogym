import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'

def get_alpha_bbox(img):
    alpha = img.getchannel('A')
    return alpha.getbbox()

def flood_fill_dark_background(img, start_color, tolerance=30):
    rgba = img.convert('RGBA')
    width, height = rgba.size
    pixels = rgba.load()
    
    queue = [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]
    visited = set(queue)
    
    while queue:
        x, y = queue.pop(0)
        r, g, b, a = pixels[x, y]
        
        # Check tolerance from start_color
        if abs(r - start_color[0]) <= tolerance and abs(g - start_color[1]) <= tolerance and abs(b - start_color[2]) <= tolerance:
            # Make it transparent
            pixels[x, y] = (0, 0, 0, 0)
            
            # Check neighbors
            for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nx, ny = x + dx, y + dy
                if 0 <= nx < width and 0 <= ny < height:
                    if (nx, ny) not in visited:
                        visited.add((nx, ny))
                        queue.append((nx, ny))
                        
    return rgba

def main():
    s = Image.open(DOCS / 'screen.png')
    sc = Image.open(DOCS / 'screen copia.png')
    
    print("Front corners:", s.getpixel((0,0)), s.getpixel((s.width-1, 0)))
    print("Back corners:", sc.getpixel((0,0)), sc.getpixel((sc.width-1, 0)))
    
    clean_s = flood_fill_dark_background(s, s.getpixel((0,0)), tolerance=40)
    clean_sc = flood_fill_dark_background(sc, sc.getpixel((0,0)), tolerance=20)
    
    print("Clean Front bbox:", get_alpha_bbox(clean_s))
    print("Clean Back bbox:", get_alpha_bbox(clean_sc))

if __name__ == '__main__':
    main()
