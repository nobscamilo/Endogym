import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ANATOMY = ROOT / 'public' / 'anatomy'
DOCS = ROOT / 'docs'

def get_alpha_bbox(img, x_offset=0):
    """Returns the bounding box of non-transparent pixels with an offset."""
    alpha = img.getchannel('A')
    bbox = alpha.getbbox()
    if bbox is None:
        return None
    return (bbox[0] + x_offset, bbox[1], bbox[2] + x_offset, bbox[3])

def flood_fill_dark_background(img, start_color, tolerance=30):
    """Robust queue-based flood fill to remove dark backgrounds without touching internal dark pixels."""
    rgba = img.convert('RGBA')
    width, height = rgba.size
    pixels = rgba.load()
    
    # Flood fill from all 4 corners
    queue = [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]
    visited = set(queue)
    
    while queue:
        x, y = queue.pop(0)
        r, g, b, a = pixels[x, y]
        
        # Check tolerance from start_color
        if abs(r - start_color[0]) <= tolerance and abs(g - start_color[1]) <= tolerance and abs(b - start_color[2]) <= tolerance:
            # Make it fully transparent
            pixels[x, y] = (0, 0, 0, 0)
            
            # Check 4-connectivity neighbors
            for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nx, ny = x + dx, y + dy
                if 0 <= nx < width and 0 <= ny < height:
                    if (nx, ny) not in visited:
                        visited.add((nx, ny))
                        queue.append((nx, ny))
                        
    return rgba

def main():
    # 0. Restore the original old-base.png first
    import subprocess
    print("Restoring old-base.png from git history...")
    subprocess.run("git show 9635784:public/anatomy/vector-muscles-base.png > old-base.png", shell=True, check=True)
    
    # 1. Load the original Wikimedia old-base
    old_base_path = ROOT / 'old-base.png'
    if not old_base_path.exists():
        print("Error: old-base.png not found.")
        sys.exit(1)
        
    old_base = Image.open(old_base_path).convert('RGBA')
    width, height = old_base.size
    print(f"Old base size: {width}x{height}")
    
    # Target Front Bounding Box in old-base (left half)
    front_half_old = old_base.crop((0, 0, width // 2, height))
    front_bbox_old = get_alpha_bbox(front_half_old, 0)
    print(f"Old Front view bbox: {front_bbox_old}")
    
    # Target Back Bounding Box in old-base (right half)
    back_half_old = old_base.crop((width // 2, 0, width, height))
    back_bbox_old = get_alpha_bbox(back_half_old, width // 2)
    print(f"Old Back view bbox: {back_bbox_old}")
    
    # 2. Load the user's new dark images from docs/
    gray_front_path = DOCS / 'screen.png'
    gray_back_path = DOCS / 'screen copia.png'
    
    if not gray_front_path.exists() or not gray_back_path.exists():
        print(f"Error: screen.png or screen copia.png not found in {DOCS}")
        sys.exit(1)
        
    gray_front_raw = Image.open(gray_front_path)
    gray_back_raw = Image.open(gray_back_path)
    
    print("Performing flood fill background removal on new front and back gray images...")
    gray_front_clean = flood_fill_dark_background(gray_front_raw, gray_front_raw.getpixel((0,0)), tolerance=40)
    gray_back_clean = flood_fill_dark_background(gray_back_raw, gray_back_raw.getpixel((0,0)), tolerance=20)
    
    # Get active bounding boxes of the background-removed user images
    front_bbox_new = get_alpha_bbox(gray_front_clean, 0)
    back_bbox_new = get_alpha_bbox(gray_back_clean, 0)
    
    print(f"New Front view bbox after cleaning: {front_bbox_new}")
    print(f"New Back view bbox after cleaning: {back_bbox_new}")
    
    # Create a fresh transparent canvas
    canvas = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    
    # 3. Process and Align Front View (Left)
    front_cropped = gray_front_clean.crop(front_bbox_new)
    target_front_w = front_bbox_old[2] - front_bbox_old[0]
    target_front_h = front_bbox_old[3] - front_bbox_old[1]
    
    # Resize and paste
    front_resized = front_cropped.resize((target_front_w, target_front_h), Image.Resampling.LANCZOS)
    canvas.paste(front_resized, (front_bbox_old[0], front_bbox_old[1]), front_resized)
    print("Front view mathematically aligned and pasted.")
    
    # 4. Process and Align Back View (Right)
    back_cropped = gray_back_clean.crop(back_bbox_new)
    target_back_w = back_bbox_old[2] - back_bbox_old[0]
    target_back_h = back_bbox_old[3] - back_bbox_old[1]
    
    # Resize and paste
    back_resized = back_cropped.resize((target_back_w, target_back_h), Image.Resampling.LANCZOS)
    canvas.paste(back_resized, (back_bbox_old[0], back_bbox_old[1]), back_resized)
    print("Back view mathematically aligned and pasted.")
    
    # 5. Save the final aligned base image
    out_path = ANATOMY / 'vector-muscles-base.png'
    canvas.save(out_path, optimize=True)
    print(f"Saved aligned base image to {out_path}")
    
    # Clean up old-base.png
    if old_base_path.exists():
        old_base_path.unlink()
        print("Cleaned up old-base.png")

if __name__ == '__main__':
    main()
