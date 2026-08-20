"""
build_site_data.py

Takes the output of extract_questions.py (questions.json + the cropped
PNG images in WORK_DIR/images) and prepares it for the web site:

  1. Reads existing data.js to avoid duplicate questions (based on uid after last _)
  2. Filters new questions to only those not already present
  3. Converts only the PNGs needed for new questions to WebP (quality 82)
  4. Rewrites the image filenames in the new question data to point at .webp files
  5. Appends the new questions to data.js
  6. Cleans up temporary files created by extract_questions.py

Usage:
    python3 extract_questions.py      # run this first
    python3 build_site_data.py

Requires: Pillow.
    pip install pillow --break-system-packages
"""

import json, os, glob, re, shutil
from PIL import Image

WORK_DIR = r"C:\Users\kevin\Downloads\sat\scripts"
SRC_IMG_DIR = os.path.join(WORK_DIR, "images")
SRC_JSON = os.path.join(WORK_DIR, "questions.json")

SITE_DIR = r"C:\Users\kevin\Downloads\sat"
DST_IMG_DIR = os.path.join(SITE_DIR, "images")
DST_DATA_JS = os.path.join(SITE_DIR, "data.js")

WEBP_QUALITY = 82


def get_existing_questions():
    """Read existing data.js and return the questions array, or empty list if not found"""
    if not os.path.exists(DST_DATA_JS):
        return []

    with open(DST_DATA_JS, "r") as f:
        content = f.read()
        match = re.search(r"const QUESTIONS = (\[.*?\]);", content, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                print("Warning: Could not parse existing data.js, starting fresh...")
                return []
    return []


def get_uid_key(uid):
    """Extract the part after the last underscore in the uid"""
    if uid and "_" in uid:
        return uid.rsplit("_", 1)[1]  # rsplit gets the last part
    return uid  # fallback to full uid if no underscore


def filter_new_questions(new_questions, existing_questions):
    """Filter out questions that already exist in data.js based on uid after last _"""
    # Build set of existing unique IDs
    existing_ids = set()
    for q in existing_questions:
        if "uid" in q:
            existing_ids.add(get_uid_key(q["uid"]))

    print(f"  Existing unique IDs: {len(existing_ids)}")

    # Track duplicates to understand what's happening
    duplicates_against_existing = []
    duplicates_within_new = []
    seen_in_batch = set()
    filtered = []

    for q in new_questions:
        if "uid" in q:
            uid_key = get_uid_key(q["uid"])

            # Check if it's a duplicate against existing
            if uid_key in existing_ids:
                duplicates_against_existing.append(q["uid"])
                continue

            # Check if it's a duplicate within the new batch
            if uid_key in seen_in_batch:
                duplicates_within_new.append(q["uid"])
                continue

            # It's a new unique question
            filtered.append(q)
            seen_in_batch.add(uid_key)
            existing_ids.add(uid_key)  # Prevent duplicates within new batch
        else:
            print(f"Warning: Question without uid found, adding anyway")
            filtered.append(q)

    if duplicates_against_existing:
        print(f"  Duplicates against existing: {len(duplicates_against_existing)}")
        sample = duplicates_against_existing[:5]
        print(
            f"    Sample: {sample}{'...' if len(duplicates_against_existing) > 5 else ''}"
        )

    if duplicates_within_new:
        print(f"  Duplicates within new batch: {len(duplicates_within_new)}")
        sample = duplicates_within_new[:5]
        print(f"    Sample: {sample}{'...' if len(duplicates_within_new) > 5 else ''}")

    print(f"  New unique questions to add: {len(filtered)}")

    return filtered


def convert_images_to_webp(needed_image_names):
    """
    Convert only the PNG images that are needed for new questions.
    needed_image_names: set of base filenames without extension (e.g., {'img_001', 'img_002'})
    """
    if not needed_image_names:
        print("No new images to convert")
        return

    os.makedirs(DST_IMG_DIR, exist_ok=True)

    # Find all PNG files in the source directory
    all_png_files = glob.glob(os.path.join(SRC_IMG_DIR, "*.png"))

    # Filter to only those we need
    needed_pngs = []
    for f in all_png_files:
        basename = os.path.splitext(os.path.basename(f))[0]
        if basename in needed_image_names:
            needed_pngs.append(f)

    print(f"converting {len(needed_pngs)} new images to webp...")

    for i, f in enumerate(needed_pngs):
        try:
            im = Image.open(f).convert("RGB")
            name = os.path.splitext(os.path.basename(f))[0] + ".webp"
            im.save(
                os.path.join(DST_IMG_DIR, name), "WEBP", quality=WEBP_QUALITY, method=6
            )
            if i % 50 == 0:
                print(f"  {i}/{len(needed_pngs)}")
        except Exception as e:
            print(f"  Error converting {f}: {e}")

    print(f"done converting {len(needed_pngs)} images")


def append_to_data_js(new_questions):
    """Append new questions to the existing data.js file"""
    if not new_questions:
        print("No new questions to add")
        return

    # Read existing questions
    existing_questions = get_existing_questions()

    # Combine
    combined = existing_questions + new_questions

    # Write back
    with open(DST_DATA_JS, "w") as f:
        f.write("const QUESTIONS = ")
        json.dump(combined, f, separators=(",", ":"))
        f.write(";\n")

    print(
        f"wrote {DST_DATA_JS} ({os.path.getsize(DST_DATA_JS)} bytes, "
        f"{len(combined)} total questions, {len(new_questions)} new)"
    )


def cleanup_temp_files():
    """Delete temporary files created by extract_questions.py"""
    print("\nCleaning up temporary files...")

    deleted_count = 0
    deleted_size = 0

    # Delete the images directory and all its contents
    if os.path.exists(SRC_IMG_DIR):
        try:
            # Calculate size before deletion
            total_size = 0
            for dirpath, dirnames, filenames in os.walk(SRC_IMG_DIR):
                for f in filenames:
                    fp = os.path.join(dirpath, f)
                    if os.path.isfile(fp):
                        total_size += os.path.getsize(fp)

            # Delete the directory
            shutil.rmtree(SRC_IMG_DIR)
            deleted_count += 1
            deleted_size += total_size
            print(f"  Deleted: {SRC_IMG_DIR} ({total_size / (1024*1024):.2f} MB)")
        except Exception as e:
            print(f"  Error deleting {SRC_IMG_DIR}: {e}")

    # Delete questions.json
    if os.path.exists(SRC_JSON):
        try:
            size = os.path.getsize(SRC_JSON)
            os.remove(SRC_JSON)
            deleted_count += 1
            deleted_size += size
            print(f"  Deleted: {SRC_JSON} ({size / 1024:.2f} KB)")
        except Exception as e:
            print(f"  Error deleting {SRC_JSON}: {e}")

    # Delete render_*.png files
    render_files = glob.glob(os.path.join(WORK_DIR, "render_*.png"))
    if render_files:
        total_size = 0
        for f in render_files:
            try:
                total_size += os.path.getsize(f)
                os.remove(f)
            except Exception as e:
                print(f"  Error deleting {f}: {e}")
        deleted_count += len(render_files)
        deleted_size += total_size
        print(
            f"  Deleted: {len(render_files)} render_*.png files ({total_size / (1024*1024):.2f} MB)"
        )

    print(
        f"  Total cleaned: {deleted_count} items, {deleted_size / (1024*1024):.2f} MB freed"
    )


def main():
    # Step 1: Load the new questions from questions.json
    with open(SRC_JSON) as f:
        all_new_questions = json.load(f)
    print(f"Loaded {len(all_new_questions)} questions from {SRC_JSON}")

    # Step 2: Get existing questions from data.js
    existing_questions = get_existing_questions()
    print(f"Found {len(existing_questions)} existing questions in data.js")

    # Step 3: Filter to only new questions
    new_questions = filter_new_questions(all_new_questions, existing_questions)

    if not new_questions:
        print("\n✓ No new questions to process. Exiting.")
        # Still clean up since there's nothing new to add
        cleanup_temp_files()
        return

    # Step 4: Collect all image filenames needed from new questions
    needed_images = set()
    for q in new_questions:
        for img in q.get("front_images", []):
            # Remove .png extension if present
            basename = os.path.splitext(img)[0]
            needed_images.add(basename)
        for img in q.get("back_images", []):
            basename = os.path.splitext(img)[0]
            needed_images.add(basename)

    print(
        f"  Need to convert {len(needed_images)} unique images for {len(new_questions)} new questions"
    )

    # Step 5: Convert only the images we need
    convert_images_to_webp(needed_images)

    # Step 6: Update image references in new questions to .webp
    for q in new_questions:
        q["front_images"] = [f.replace(".png", ".webp") for f in q["front_images"]]
        q["back_images"] = [f.replace(".png", ".webp") for f in q["back_images"]]

    # Step 7: Append to data.js
    append_to_data_js(new_questions)

    # Step 8: Clean up temporary files
    cleanup_temp_files()

    print("\n✓ Done! Summary:")
    print(f"  - Existing questions: {len(existing_questions)}")
    print(f"  - New questions added: {len(new_questions)}")
    print(f"  - Total questions: {len(existing_questions) + len(new_questions)}")


if __name__ == "__main__":
    main()
