import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ANATOMY = ROOT / 'public' / 'anatomy'

def get_alpha_bbox(img, x_offset=0):
    """Returns the bounding box of non-transparent pixels with an offset."""
    alpha = img.getchannel('A')
    bbox = alpha.getbbox()
    if bbox is None:
        return None
    return (bbox[0] + x_offset, bbox[1], bbox[2] + x_offset, bbox[3])

def main():
    # 1. Restore the original old-base.png from Git
    # We will do this inside the script by running a subprocess or assume it is done
    old_base_path = ROOT / 'old-base.png'
    if not old_base_path.exists():
        print("Error: old-base.png not found. Please restore it first.")
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
    
    # 2. Load the clean transparent user bodies
    clean_bodies_path = ROOT / 'clean-bodies.png'
    if not clean_bodies_path.exists():
        print("Error: clean-bodies.png not found. Please run remove_background.py first.")
        sys.exit(1)
        
    clean_bodies = Image.open(clean_bodies_path).convert('RGBA')
    cb_w, cb_h = clean_bodies.size
    
    # Clean up the 5px border of clean_bodies to remove any border artifacts from the JPEG
    for y in range(cb_h):
        for x in range(cb_w):
            if x < 15 or x > cb_w - 15 or y < 15 or y > cb_h - 15:
                clean_bodies.putpixel((x, y), (0, 0, 0, 0))
                
    # Now find the true bounding box of the front body (left side)
    front_half_new = clean_bodies.crop((15, 15, cb_w // 2, cb_h - 15))
    front_bbox_new = get_alpha_bbox(front_half_new, 15)
    print(f"New Front view bbox: {front_bbox_new}")
    
    # Find the true bounding box of the back body (right side)
    back_half_new = clean_bodies.crop((cb_w // 2, 15, cb_w - 15, cb_h - 15))
    back_bbox_new = get_alpha_bbox(back_half_new, cb_w // 2)
    print(f"New Back view bbox: {back_bbox_new}")
    
    if front_bbox_new is None or back_bbox_new is None:
        print("Error: Could not isolate body silhouettes in user image.")
        sys.exit(1)
        
    # Create a fresh transparent canvas
    canvas = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    
    # 3. Process and Align Front View (Left)
    front_cropped = clean_bodies.crop(front_bbox_new)
    target_front_w = front_bbox_old[2] - front_bbox_old[0]
    target_front_h = front_bbox_old[3] - front_bbox_old[1]
    
    # Add a tiny adjustment padding to fit the vector layers perfectly
    front_resized = front_cropped.resize((target_front_w, target_front_h), Image.Resampling.LANCZOS)
    canvas.paste(front_resized, (front_bbox_old[0], front_bbox_old[1]), front_resized)
    print("Front view mathematically aligned and pasted.")
    
    # 4. Process and Align Back View (Right)
    back_cropped = clean_bodies.crop(back_bbox_new)
    target_back_w = back_bbox_old[2] - back_bbox_old[0]
    target_back_h = back_bbox_old[3] - back_bbox_old[1]
    
    back_resized = back_cropped.resize((target_back_w, target_back_h), Image.Resampling.LANCZOS)
    canvas.paste(back_resized, (back_bbox_old[0], back_bbox_old[1]), back_resized)
    print("Back view mathematically aligned and pasted.")
    
    # 5. Save the final aligned base image
    out_path = ANATOMY / 'vector-muscles-base.png'
    canvas.save(out_path, optimize=True)
    print(f"Saved aligned base image to {out_path}")

if __name__ == '__main__':
    main()
