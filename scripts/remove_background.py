from PIL import Image

def remove_background(img_path, out_path):
    img = Image.open(img_path).convert('RGBA')
    width, height = img.size
    
    # Create new image with transparency
    new_img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    
    for y in range(height):
        for x in range(width):
            r, g, b, a = img.getpixel((x, y))
            
            # Check if it's the checkerboard background
            # The background is composed of pure white (255, 255, 255) and light gray (201-205, 201-205, 201-205)
            is_white = (r > 250 and g > 250 and b > 250)
            is_gray = (200 <= r <= 206 and 200 <= g <= 206 and 200 <= b <= 206)
            
            if is_white or is_gray:
                # Background -> Transparent
                new_img.putpixel((x, y), (0, 0, 0, 0))
            else:
                # Body -> Keep pixel
                new_img.putpixel((x, y), (r, g, b, 255))
                
    new_img.save(out_path, optimize=True)
    print(f"Saved background-removed image to {out_path}")

if __name__ == '__main__':
    remove_background(
        '/Users/camilosar/.gemini/antigravity/brain/162f9e7e-7613-4af5-9a9f-33879039e4a5/vector_muscles_base_clean_1780012646551.png',
        'clean-bodies.png'
    )
