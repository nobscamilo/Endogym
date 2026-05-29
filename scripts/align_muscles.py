import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ANATOMY = ROOT / 'public' / 'anatomy'

def get_alpha_bbox(img):
    """Returns the bounding box (left, top, right, bottom) of non-transparent pixels."""
    alpha = img.getchannel('A')
    bbox = alpha.getbbox()
    return bbox

def align_and_combine():
    # 1. Load the original caricature base to get target positions
    old_base_path = ROOT / 'old-base.png'
    if not old_base_path.exists():
        print(f"Error: {old_base_path} not found. Please restore it from git first.")
        sys.exit(1)
        
    old_base = Image.open(old_base_path).convert('RGBA')
    width, height = old_base.size
    print(f"Old base size: {width}x{height}")
    
    # Left half: Front view
    front_half = old_base.crop((0, 0, width // 2, height))
    front_bbox_local = get_alpha_bbox(front_half)
    if front_bbox_local is None:
        print("Error: Could not find front silhouette in old base left half.")
        sys.exit(1)
    # Convert local crop bbox to global old_base coordinates
    bbox_old_front = (front_bbox_local[0], front_bbox_local[1], front_bbox_local[2], front_bbox_local[3])
    print(f"Old Front view bbox: {bbox_old_front}")
    
    # Right half: Back view
    back_half = old_base.crop((width // 2, 0, width, height))
    back_bbox_local = get_alpha_bbox(back_half)
    if back_bbox_local is None:
        print("Error: Could not find back silhouette in old base right half.")
        sys.exit(1)
    # Convert local crop bbox to global old_base coordinates
    bbox_old_back = (back_bbox_local[0] + width // 2, back_bbox_local[1], back_bbox_local[2] + width // 2, back_bbox_local[3])
    print(f"Old Back view bbox: {bbox_old_back}")
    
    # 2. Load the transparent high-fidelity front and back images
    gymbro_front_path = ANATOMY / 'gymbro-front-base.png'
    gymbro_back_path = ANATOMY / 'gymbro-back-base.png'
    
    if not gymbro_front_path.exists() or not gymbro_back_path.exists():
        print("Error: gymbro-front-base.png or gymbro-back-base.png not found.")
        sys.exit(1)
        
    gymbro_front = Image.open(gymbro_front_path).convert('RGBA')
    gymbro_back = Image.open(gymbro_back_path).convert('RGBA')
    
    # Find bounding boxes of non-transparent areas in the high-fidelity images
    bbox_new_front = get_alpha_bbox(gymbro_front)
    bbox_new_back = get_alpha_bbox(gymbro_back)
    
    print(f"New Front bbox: {bbox_new_front}")
    print(f"New Back bbox: {bbox_new_back}")
    
    # Create the final transparent canvas
    canvas = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    
    # 3. Process and align Front View (Left)
    # Crop the new front view to its minimal bounding box
    front_cropped = gymbro_front.crop(bbox_new_front)
    
    # Calculate target dimensions in old base
    target_front_w = bbox_old_front[2] - bbox_old_front[0]
    target_front_h = bbox_old_front[3] - bbox_old_front[1]
    
    # Resize new front view to match the exact size of the old silhouette
    front_resized = front_cropped.resize((target_front_w, target_front_h), Image.Resampling.LANCZOS)
    
    # Paste on canvas at the exact old silhouette start coordinate
    canvas.paste(front_resized, (bbox_old_front[0], bbox_old_front[1]), front_resized)
    print("Aligned Front view pasted successfully.")
    
    # 4. Process and align Back View (Right)
    # Crop the new back view to its minimal bounding box
    back_cropped = gymbro_back.crop(bbox_new_back)
    
    # Calculate target dimensions in old base
    target_back_w = bbox_old_back[2] - bbox_old_back[0]
    target_back_h = bbox_old_back[3] - bbox_old_back[1]
    
    # Resize new back view to match the exact size of the old silhouette
    back_resized = back_cropped.resize((target_back_w, target_back_h), Image.Resampling.LANCZOS)
    
    # Paste on canvas at the exact old silhouette start coordinate
    canvas.paste(back_resized, (bbox_old_back[0], bbox_old_back[1]), back_resized)
    print("Aligned Back view pasted successfully.")
    
    # 5. Save the final perfectly aligned base image
    out_path = ANATOMY / 'vector-muscles-base.png'
    canvas.save(out_path, optimize=True)
    print(f"Saved perfectly aligned base image to {out_path}")

if __name__ == '__main__':
    align_and_combine()
